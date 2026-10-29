/**
 * Система «Звёздное Веретено» (Star Spindle) для Foundry VTT.
 */
import { SPINDLE, SYSTEM_ID } from "./config.mjs";
import * as actorModels from "./data/actor-models.mjs";
import * as itemModels from "./data/item-models.mjs";
import { SpindleActor } from "./documents/actor.mjs";
import { SpindleItem } from "./documents/item.mjs";
import { DicePool } from "./dice/pool.mjs";
import { Chernobog } from "./chernobog.mjs";
import { CharacterSheet } from "./sheets/character-sheet.mjs";
import { NpcSheet } from "./sheets/npc-sheet.mjs";
import { ShipSheet } from "./sheets/ship-sheet.mjs";
import { SpindleItemSheet } from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Инициализация системы «Звёздное Веретено»`);

  CONFIG.SPINDLE = SPINDLE;
  game.starSpindle = { config: SPINDLE, DicePool, Chernobog };

  CONFIG.Actor.documentClass = SpindleActor;
  CONFIG.Item.documentClass = SpindleItem;

  Object.assign(CONFIG.Actor.dataModels, {
    character: actorModels.CharacterData,
    npc: actorModels.NpcData,
    ship: actorModels.ShipData
  });
  Object.assign(CONFIG.Item.dataModels, {
    weapon: itemModels.WeaponData,
    armor: itemModels.ArmorData,
    gear: itemModels.GearData,
    implant: itemModels.ImplantData,
    ability: itemModels.AbilityData,
    trait: itemModels.TraitData,
    specialization: itemModels.SpecializationData,
    injury: itemModels.InjuryData,
    shipWeapon: itemModels.ShipWeaponData,
    shipModule: itemModels.ShipModuleData,
    shipUpgrade: itemModels.ShipUpgradeData,
    cargo: itemModels.CargoData
  });

  // Эффекты предметов применяются к владельцу напрямую.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Инициатива: к20 + модификатор инициативы оружия + чистое значение проворства + прочие модификаторы.
  // Для корабля — к20 + лидерство капитана.
  CONFIG.Combat.initiative = { formula: "1d20 + @initiative", decimals: 0 };

  registerSettings();
  registerSheets();
  registerTemplates();
});

Hooks.once("ready", () => {
  game.socket.on(`system.${SYSTEM_ID}`, onSocket);
  Chernobog.renderCounter();
});

Hooks.on("renderChatMessageHTML", (message, html) => DicePool.onRenderChatMessage(message, html));
Hooks.on("renderPlayers", () => Chernobog.renderCounter());

/* -------------------------------------------- */

/** Запросы игроков, которые выполняет активный Мастер. */
function onSocket(data) {
  if (!game.users.activeGM?.isSelf) return;
  switch (data.action) {
    case "chernobog": {
      const user = game.users.get(data.user);
      return Chernobog.add(data.delta, data.reason ?? user?.name);
    }
    case "damage":
      return DicePool.resolveDamage(data.request);
  }
}

function registerSettings() {
  const world = (key, data) => game.settings.register(SYSTEM_ID, key, { scope: "world", config: true, ...data });

  game.settings.register(SYSTEM_ID, Chernobog.SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => Chernobog.renderCounter()
  });
  world("chernobogVisible", {
    name: "SPINDLE.Settings.ChernobogVisible.name",
    hint: "SPINDLE.Settings.ChernobogVisible.hint",
    type: Boolean,
    default: true,
    onChange: () => Chernobog.renderCounter()
  });
  world("autoTokens", {
    name: "SPINDLE.Settings.AutoTokens.name",
    hint: "SPINDLE.Settings.AutoTokens.hint",
    type: Boolean,
    default: true
  });
  world("professionalGate", {
    name: "SPINDLE.Settings.ProfessionalGate.name",
    hint: "SPINDLE.Settings.ProfessionalGate.hint",
    type: Boolean,
    default: true
  });
  world("heroTokens", {
    name: "SPINDLE.Settings.HeroTokens.name",
    hint: "SPINDLE.Settings.HeroTokens.hint",
    type: Boolean,
    default: false
  });
  for (const table of ["injury", "shipCrit", "compartment", "jump"]) {
    world(`table.${table}`, {
      name: `SPINDLE.Settings.Table.${table}`,
      hint: "SPINDLE.Settings.Table.hint",
      type: String,
      default: ""
    });
  }
}

function registerSheets() {
  const { Actors, Items } = foundry.documents.collections;
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Actors.registerSheet(SYSTEM_ID, CharacterSheet, {
    types: ["character"], makeDefault: true, label: "SPINDLE.Sheet.character"
  });
  Actors.registerSheet(SYSTEM_ID, NpcSheet, {
    types: ["npc"], makeDefault: true, label: "SPINDLE.Sheet.npc"
  });
  Actors.registerSheet(SYSTEM_ID, ShipSheet, {
    types: ["ship"], makeDefault: true, label: "SPINDLE.Sheet.ship"
  });
  Items.registerSheet(SYSTEM_ID, SpindleItemSheet, {
    makeDefault: true, label: "SPINDLE.Sheet.item"
  });
}

function registerTemplates() {
  foundry.applications.handlebars.loadTemplates([
    "item-controls", "section-header", "simple-list", "effects", "html-field", "module-table",
    "condition", "skills-table", "abilities", "trait-list", "injuries"
  ].map(p => `systems/${SYSTEM_ID}/templates/actor/parts/${p}.hbs`));
}
