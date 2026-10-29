import { SPINDLE } from "../config.mjs";
import { DicePool } from "../dice/pool.mjs";
import { SpindleActorSheet, templatePath } from "./base-actor-sheet.mjs";

const { DialogV2 } = foundry.applications.api;

export class ShipSheet extends SpindleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["ship"],
    position: { width: 940, height: 820 },
    actions: {
      shipWeaponRoll: ShipSheet.#onShipWeaponRoll,
      crewOpen: ShipSheet.#onCrewOpen,
      crewRemove: ShipSheet.#onCrewRemove,
      crewRoll: ShipSheet.#onCrewRoll,
      shipInitiative: ShipSheet.#onShipInitiative
    }
  };

  static PARTS = {
    header: { template: templatePath("actor/ship-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: templatePath("actor/ship-main.hbs"), scrollable: [""] },
    modules: { template: templatePath("actor/ship-modules.hbs"), scrollable: [""] },
    cargo: { template: templatePath("actor/ship-cargo.hbs"), scrollable: [""] },
    crew: { template: templatePath("actor/ship-crew.hbs"), scrollable: [""] },
    log: { template: templatePath("actor/ship-log.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-rocket", label: "SPINDLE.Tab.ship" },
        { id: "modules", icon: "fa-solid fa-microchip", label: "SPINDLE.Tab.modules" },
        { id: "cargo", icon: "fa-solid fa-boxes-stacked", label: "SPINDLE.Tab.cargo" },
        { id: "crew", icon: "fa-solid fa-users", label: "SPINDLE.Tab.crew" },
        { id: "log", icon: "fa-solid fa-book", label: "SPINDLE.Tab.log" }
      ],
      initial: "main"
    }
  };

  static HTML_FIELDS = ["criticals", "logbook"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.shipAttributes = Object.entries(SPINDLE.shipAttributes).map(([key, label]) => ({
      key, label, ...system.attributes[key]
    }));
    context.energySystems = Object.entries(SPINDLE.energySystems).map(([key, cfg]) => ({
      key, label: cfg.label, value: system.energyAllocation[key]
    }));
    context.classOptions = SPINDLE.shipClasses;
    context.roleOptions = SPINDLE.crewRoles;
    context.rangeLabels = Object.fromEntries(Object.entries(SPINDLE.shipRanges).map(([k, v]) => [k, v.label]));
    context.conditionLabel = system.condition === "ok" ? null : `SPINDLE.Ship.Condition.${system.condition}`;
    const modules = context.items.shipModule ?? [];
    const states = Object.entries(SPINDLE.moduleStates).map(([key, cfg]) => ({ key, label: cfg.label }));
    const decorate = m => ({
      item: m,
      states: states.map(s => ({ ...s, checked: m.system.state === s.key }))
    });
    context.modules = {
      base: modules.filter(m => m.system.category === "base").map(decorate),
      extra: modules.filter(m => m.system.category === "extra").map(decorate)
    };
    context.moduleStates = states;
    context.crew = system.crewMembers.map(c => ({ ...c, skill: SPINDLE.crewRoleSkills[c.role] ?? "piloting" }));
    context.skillOptions = SPINDLE.skillChoices();
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-crew-role]").forEach(el => {
      el.addEventListener("change", this.#onCrewRoleChange.bind(this));
    });
  }

  /* -------------------------------------------- */
  /*  Экипаж                                      */
  /* -------------------------------------------- */

  /** Бросьте персонажа на лист корабля, чтобы добавить его в экипаж. */
  async _onDropActor(event, actor) {
    if (!this.isEditable) return null;
    // В Foundry v13+ сюда приходит документ; на всякий случай поддерживаем и данные перетаскивания.
    if (!(actor instanceof Actor)) actor = actor?.uuid ? await fromUuid(actor.uuid) : null;
    if (!actor || (actor.type === "ship")) return null;
    const crew = this.document.system.toObject().crew;
    if (crew.some(c => c.uuid === actor.uuid)) return null;
    crew.push({ uuid: actor.uuid, role: "" });
    await this.document.update({ "system.crew": crew });
    return actor;
  }

  #onCrewRoleChange(event) {
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.crewRole);
    const crew = this.document.system.toObject().crew;
    if (!crew[index]) return;
    crew[index].role = event.currentTarget.value;
    return this.document.update({ "system.crew": crew });
  }

  static #crewIndex(target) {
    return Number(target.closest("[data-crew-index]")?.dataset.crewIndex);
  }

  static async #onCrewOpen(event, target) {
    const uuid = this.document.system.crew[ShipSheet.#crewIndex(target)]?.uuid;
    const actor = uuid ? await fromUuid(uuid) : null;
    actor?.sheet.render(true);
  }

  static #onCrewRemove(event, target) {
    const crew = this.document.system.toObject().crew;
    crew.splice(ShipSheet.#crewIndex(target), 1);
    return this.document.update({ "system.crew": crew });
  }

  static async #onCrewRoll(event, target) {
    const uuid = this.document.system.crew[ShipSheet.#crewIndex(target)]?.uuid;
    const actor = uuid ? await fromUuid(uuid) : null;
    if (!actor) return;
    const skill = target.closest("[data-crew-index]").querySelector("select[data-crew-skill]")?.value || "piloting";
    return DicePool.check({ actor, skill, ship: this.document, skipDialog: event.shiftKey });
  }

  static #onShipInitiative(event, target) {
    return DicePool.shipInitiative(this.document, target.dataset.role);
  }

  /* -------------------------------------------- */
  /*  Оружие корабля                              */
  /* -------------------------------------------- */

  static async #onShipWeaponRoll(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    if (item.system.ammo.max > 0 && item.system.ammo.value <= 0) {
      return ui.notifications.warn(game.i18n.format("SPINDLE.Roll.NoAmmo", { name: item.name }));
    }
    const gunner = await this.#chooseGunner();
    if (!gunner) return;
    const result = await DicePool.check({
      actor: gunner, skill: "shooting", item, ship: this.document,
      title: `${item.name} (${this.document.name})`, skipDialog: event.shiftKey
    });
    if (result && item.system.ammo.max > 0) {
      await item.update({ "system.ammo.value": item.system.ammo.value - 1 });
    }
    return result;
  }

  /** Выбрать, кто из экипажа стреляет. */
  async #chooseGunner() {
    const crew = this.document.system.crewMembers.filter(c => c.actor.isOwner)
      .sort((a, b) => (b.role === "gunner") - (a.role === "gunner"));
    if (!crew.length) {
      if (game.user.character) return game.user.character;
      ui.notifications.warn("SPINDLE.Crew.NoGunner", { localize: true });
      return null;
    }
    if (crew.length === 1) return crew[0].actor;
    const options = crew.map(c =>
      `<option value="${c.uuid}">${c.actor.name}${c.role ? ` — ${game.i18n.localize(SPINDLE.crewRoles[c.role])}` : ""}</option>`
    ).join("");
    const uuid = await DialogV2.prompt({
      window: { title: game.i18n.localize("SPINDLE.Crew.ChooseGunner") },
      content: `<div class="form-group"><label>${game.i18n.localize("SPINDLE.Crew.Member")}</label><select name="gunner">${options}</select></div>`,
      ok: { callback: (event, button) => button.form.elements.gunner.value },
      rejectClose: false
    });
    return uuid ? fromUuid(uuid) : null;
  }
}
