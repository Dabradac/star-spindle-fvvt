import { SPINDLE } from "../config.mjs";

const {
  HTMLField, NumberField, SchemaField, StringField, ArrayField, BooleanField
} = foundry.data.fields;

const int = (initial = 0, options = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, initial, ...options });

const resource = (initial = 0) => new SchemaField({
  value: int(initial),
  max: int(initial, { min: 0 })
});

/**
 * Состояние по текущему значению Здоровья или Воли.
 * При нуле и ниже персонаж выведен из строя, а когда отрицательное значение
 * превышает половину максимума (с округлением вверх) — погибает или сходит с ума.
 */
function conditionOf(value, max) {
  if (value > 0) return "ok";
  if (-value > Math.ceil(max / 2)) return "dead";
  return "down";
}

/* -------------------------------------------- */

/**
 * Общая часть для персонажей и НИП: характеристики, навыки, Здоровье и Воля.
 */
class CreatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attributes = {};
    for (const key of Object.keys(SPINDLE.attributes)) {
      attributes[key] = new SchemaField({ value: int(1, { min: 0 }) });
    }
    const skills = {};
    for (const key of Object.keys(SPINDLE.skills)) {
      // bonus — модификатор кубов к проверкам навыка (для активных эффектов, травм и т. п.).
      skills[key] = new SchemaField({ value: int(0, { min: 0 }), bonus: int(0) });
    }
    return {
      attributes: new SchemaField(attributes),
      skills: new SchemaField(skills),
      health: new SchemaField({ value: int(2), max: int(2, { min: 0 }), bonus: int(0) }),
      will: new SchemaField({ value: int(2), max: int(2, { min: 0 }), bonus: int(0) }),
      bonuses: new SchemaField({
        checks: int(0),
        initiative: int(0),
        armor: int(0)
      }),
      speed: int(10, { min: 0 }),
      biography: new HTMLField(),
      injuries: new HTMLField()
    };
  }

  /** Считать ли максимум Здоровья и Воли по формуле. */
  get autoMax() {
    return true;
  }

  /** Дополнительное снижение максимальной Воли (например, от киберимплантов). */
  get willPenalty() {
    return 0;
  }

  prepareDerivedData() {
    const a = this.attributes;
    const src = this._source;
    const baseHealth = this.autoMax ? a.body.value + a.agility.value : src.health.max;
    const baseWill = this.autoMax ? a.intellect.value + a.empathy.value : src.will.max;
    this.health.max = Math.max(baseHealth + this.health.bonus, 0);
    this.will.max = Math.max(baseWill + this.will.bonus - this.willPenalty, 0);

    for (const [key, skill] of Object.entries(this.skills)) {
      const cfg = SPINDLE.skills[key];
      skill.attribute = cfg.attribute;
      skill.professional = cfg.professional;
      skill.total = skill.value + (a[cfg.attribute]?.value ?? 0);
    }

    const items = this.parent.items;
    const armor = items.filter(i => i.type === "armor" && i.system.equipped && !i.system.stored);
    this.armor = Math.max(armor.reduce((acc, i) => acc + i.system.defense + i.system.quality, 0)
      + this.bonuses.armor, 0);

    const weapons = items.filter(i => i.type === "weapon" && i.system.equipped && !i.system.stored);
    const inits = weapons.map(i => i.system.initiative);
    this.initiative = (inits.length ? Math.max(...inits) : 0) + this.skills.dexterity.value + this.bonuses.initiative;
    this.effectiveSpeed = this.speed;

    this.#prepareCondition();
  }

  #prepareCondition() {
    for (const key of ["health", "will"]) {
      const res = this[key];
      res.value = Math.min(res.value, res.max);
      res.pct = res.max ? Math.clamp(Math.round(res.value / res.max * 100), 0, 100) : 0;
      res.condition = conditionOf(res.value, res.max);
      res.limit = -Math.ceil(res.max / 2);
    }
  }

  /**
   * Бонусы к проверке навыка от предметов, особых способностей и черт.
   * @param {string} skill
   * @returns {{name: string, value: number, conditional: boolean}[]}
   */
  getSkillBonuses(skill) {
    const bonuses = [];
    for (const item of this.parent.items) {
      const sys = item.system;
      if (!sys.bonusTarget || !sys.modifier) continue;
      if ((sys.bonusTarget !== "checks") && (sys.bonusTarget !== `skill.${skill}`)) continue;
      // Снаряжение работает, пока его носят с собой, а не держат в каюте.
      if (sys.stored) continue;
      const value = sys.modifier + (sys.quality ?? 0);
      if (value) bonuses.push({ name: item.name, value, conditional: !!sys.conditional });
    }
    return bonuses;
  }

  /**
   * Постоянные модификаторы проверки, которые не зависят от предметов:
   * бонусы навыка из эффектов, общий бонус, перегруз, вес брони.
   * @param {string} skill
   * @returns {{label: string, value: number}[]}
   */
  getSituationalModifiers(skill) {
    const mods = [];
    const s = this.skills[skill];
    if (s?.bonus) mods.push({ label: "SPINDLE.Roll.SkillBonus", value: s.bonus });
    if (this.bonuses.checks) mods.push({ label: "SPINDLE.Roll.ChecksBonus", value: this.bonuses.checks });
    return mods;
  }

  getRollData() {
    const data = {};
    for (const [k, v] of Object.entries(this.attributes)) data[k] = v.value;
    for (const [k, v] of Object.entries(this.skills)) data[k] = v.value;
    data.initiative = this.initiative;
    data.armor = this.armor;
    return data;
  }
}

/* -------------------------------------------- */

export class CharacterData extends CreatureData {
  static defineSchema() {
    const factions = {};
    for (const key of Object.keys(SPINDLE.factions)) factions[key] = int(0);
    const clans = {};
    for (const key of Object.keys(SPINDLE.clans)) clans[key] = int(0);
    const resources = {};
    for (const key of Object.keys(SPINDLE.resourceTiers)) resources[key] = int(0, { min: 0 });

    return {
      ...super.defineSchema(),
      supercredits: int(0),
      reputation: int(0, { min: -5, max: 5 }),
      xp: int(0, { min: 0 }),
      origin: new StringField({ required: true, blank: true }),
      religion: new StringField({ required: true, blank: true, choices: SPINDLE.religions }),
      // Число перебросов с бонусом +1 после службы в храме или часовне (до трёх).
      blessing: int(0, { min: 0, max: 3 }),
      heroTokens: int(0, { min: 0 }),
      encumbranceBonus: int(0),
      resources: new SchemaField(resources),
      cabin: new SchemaField({
        description: new HTMLField(),
        storage: new HTMLField()
      }),
      factions: new SchemaField(factions),
      clans: new SchemaField(clans),
      appearance: new HTMLField(),
      notes: new HTMLField()
    };
  }

  get canPray() {
    return this.religion !== "atheist";
  }

  /** Каждый второй киберимплант снижает максимальную Волю на 1. */
  get willPenalty() {
    return Math.floor(this.cyberImplants / 2);
  }

  prepareDerivedData() {
    this.cyberImplants = this.parent.items.filter(i => i.type === "implant" && i.system.kind === "cyber").length;
    super.prepareDerivedData();
    this.#prepareLevel();
    this.#prepareEncumbrance();
    this.specialization = this.parent.items.find(i => i.type === "specialization") ?? null;
  }

  #prepareLevel() {
    const table = SPINDLE.xpTable;
    let level = 1;
    for (let l = 1; l < table.length; l++) if (this.xp >= table[l]) level = l;
    this.level = level;
    this.nextLevelXp = table[level + 1] ?? null;
  }

  /**
   * Нагрузка в ячейках снаряжения: Телосложение×2 + Сила.
   * Надетая броня и самое тяжёлое оружие в руках считаются на категорию легче.
   * Тяжёлые и громоздкие вещи в руках или надетые дают штраф к Проворству и Скрытности,
   * лёгкая броня или её отсутствие — бонус +1.
   */
  #prepareEncumbrance() {
    const sizes = SPINDLE.sizes;
    const items = this.parent.items.filter(i => sizes[i.system.size] && !i.system.stored);
    const ready = items.filter(i => i.type === "weapon" && i.system.equipped)
      .sort((a, b) => sizes[b.system.size].step - sizes[a.system.size].step)[0];

    let value = 0;
    for (const item of items) {
      const sys = item.system;
      const size = sizes[sys.size];
      const reduced = (item === ready) || ((item.type === "armor") && sys.equipped);
      const first = reduced ? sizes[SPINDLE.sizeByStep(Math.max(size.step - 1, 0))].slots : size.slots;
      sys.slots = sys.quantity > 0 ? first + (size.slots * (sys.quantity - 1)) : 0;
      value += sys.slots;
    }

    const max = (this.attributes.body.value * 2) + this.skills.strength.value + this.encumbranceBonus;
    this.encumbrance = {
      value: Math.round(value * 10) / 10,
      max,
      over: value > max,
      impossible: value > max * 2,
      pct: max ? Math.min(Math.round(value / max * 100), 100) : 100
    };

    // Модификатор Проворства и Скрытности от веса брони и оружия в руках.
    const worn = items.filter(i => ((i.type === "armor") || (i.type === "weapon")) && i.system.equipped);
    const steps = worn.map(i => sizes[i.system.size].step);
    const armor = worn.filter(i => i.type === "armor");
    let agility = 0;
    if (steps.some(s => s >= sizes.bulky.step)) agility = -3;
    else if (steps.some(s => s >= sizes.heavy.step)) agility = -2;
    else if (armor.every(i => sizes[i.system.size].step <= sizes.light.step)) agility = 1;
    this.encumbrance.agilityMod = agility;
    this.encumbrance.bulky = steps.some(s => s >= sizes.bulky.step);
    // Громоздкая броня или оружие в руках вдвое снижают скорость.
    this.effectiveSpeed = this.encumbrance.bulky ? Math.floor(this.speed / 2) : this.speed;
  }

  getSituationalModifiers(skill) {
    const mods = super.getSituationalModifiers(skill);
    const enc = this.encumbrance;
    if (enc.agilityMod && ["dexterity", "stealth"].includes(skill)) {
      mods.push({ label: "SPINDLE.Roll.ArmorWeight", value: enc.agilityMod });
    }
    if (enc.over && (skill !== "strength")) mods.push({ label: "SPINDLE.Roll.Overloaded", value: -2 });
    return mods;
  }
}

/* -------------------------------------------- */

export class NpcData extends CreatureData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      role: new StringField({ required: true, blank: true }),
      // У существ Здоровье и Воля часто не следуют формуле.
      useFormula: new BooleanField({ initial: true }),
      danger: int(1, { min: 0, max: 3 }),
      rarity: int(0),
      actionPoints: int(3, { min: 0 }),
      defenses: new StringField({ required: true, blank: true }),
      notes: new HTMLField()
    };
  }

  get autoMax() {
    return this.useFormula;
  }
}

/* -------------------------------------------- */

export class ShipData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attributes = {};
    for (const key of Object.keys(SPINDLE.shipAttributes)) attributes[key] = resource(0);
    const energy = {};
    for (const key of Object.keys(SPINDLE.energySystems)) energy[key] = int(0, { min: 0 });
    return {
      shipClass: int(1, { min: 1, max: 5 }),
      size: int(1, { min: 0 }),
      hull: new StringField({ required: true, blank: true }),
      hullBonuses: new StringField({ required: true, blank: true }),
      flaw: new StringField({ required: true, blank: true }),
      baseCost: int(0, { min: 0 }),
      lastMaintenance: new StringField({ required: true, blank: true }),
      debt: new SchemaField({
        initial: int(0, { min: 0 }),
        remaining: int(0, { min: 0 }),
        monthly: int(0, { min: 0 })
      }),
      attributes: new SchemaField(attributes),
      energyAllocation: new SchemaField(energy),
      batteries: int(0, { min: 0 }),
      criticals: new HTMLField(),
      cargoMax: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      modulesMax: int(0, { min: 0 }),
      crew: new ArrayField(new SchemaField({
        uuid: new StringField({ required: true, blank: false }),
        role: new StringField({ required: true, blank: true, choices: SPINDLE.crewRoles })
      })),
      logbook: new HTMLField()
    };
  }

  prepareDerivedData() {
    const items = this.parent.items;
    this.cargo = {
      max: this.cargoMax,
      value: Math.round(items.filter(i => i.type === "cargo")
        .reduce((acc, i) => acc + i.system.weight * i.system.quantity, 0) * 100) / 100
    };
    this.cargo.over = this.cargo.value > this.cargo.max;
    this.modules = {
      max: this.modulesMax,
      value: items.filter(i => i.type === "shipModule").length
    };
    for (const attr of Object.values(this.attributes)) {
      attr.pct = attr.max ? Math.clamp(Math.round(attr.value / attr.max * 100), 0, 100) : 0;
    }

    const energy = this.attributes.energy;
    this.energyAllocated = Object.values(this.energyAllocation).reduce((a, b) => a + b, 0);
    this.energyOver = this.energyAllocated > Math.max(energy.value, 0);
    // Отрицательная энергия (системный урон) — штраф ко всем проверкам экипажа.
    this.systemPenalty = Math.min(energy.value, 0);

    // Прочность 0 — корабль выведен из строя; минус половина максимума — космический мусор.
    const dur = this.attributes.durability;
    if (dur.value > 0) this.condition = "ok";
    else this.condition = (-dur.value >= Math.ceil(dur.max / 2)) ? "scrap" : "wrecked";
  }

  /** Члены экипажа как документы актёров (недоступные отбрасываются). */
  get crewMembers() {
    return this.crew.map((c, index) => {
      const actor = fromUuidSync(c.uuid);
      return actor ? { index, actor, role: c.role, uuid: c.uuid } : null;
    }).filter(Boolean);
  }

  /** Член экипажа в заданной роли. */
  crewInRole(role) {
    return this.crewMembers.find(c => c.role === role)?.actor ?? null;
  }

  /**
   * Модификаторы корабля к проверке члена экипажа:
   * манёвренность к пилотированию, распределённая энергия, системный урон.
   * @param {string} skill
   * @returns {{label: string, value: number}[]}
   */
  getCrewModifiers(skill) {
    const mods = [];
    const maneuver = this.attributes.maneuverability.value;
    if ((skill === "piloting") && maneuver) {
      mods.push({ label: "SPINDLE.Ship.Attribute.maneuverability", value: maneuver });
    }
    for (const [key, cfg] of Object.entries(SPINDLE.energySystems)) {
      const value = this.energyAllocation[key];
      if (value && cfg.skills.includes(skill)) mods.push({ label: cfg.label, value });
    }
    if (this.systemPenalty) mods.push({ label: "SPINDLE.Ship.SystemDamage", value: this.systemPenalty });
    return mods;
  }

  getRollData() {
    const captain = this.crewInRole("captain");
    return {
      initiative: captain?.system.skills?.leadership?.value ?? 0,
      maneuverability: this.attributes.maneuverability.value,
      armor: this.attributes.armor.value
    };
  }
}
