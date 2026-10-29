import { SPINDLE, SYSTEM_ID } from "../config.mjs";
import { DicePool } from "../dice/pool.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Общая основа листов актёров: работа с предметами, эффектами и бросками.
 */
export class SpindleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["star-spindle", "sheet", "actor"],
    position: { width: 920, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAttribute: SpindleActorSheet.#onRollAttribute,
      rollSkill: SpindleActorSheet.#onRollSkill,
      itemCreate: SpindleActorSheet.#onItemCreate,
      itemEdit: SpindleActorSheet.#onItemEdit,
      itemDelete: SpindleActorSheet.#onItemDelete,
      itemUse: SpindleActorSheet.#onItemUse,
      itemToggle: SpindleActorSheet.#onItemToggle,
      traitActivate: SpindleActorSheet.#onTraitActivate,
      rollResist: SpindleActorSheet.#onRollResist,
      rollD66: SpindleActorSheet.#onRollD66,
      longRest: SpindleActorSheet.#onLongRest,
      effectCreate: SpindleActorSheet.#onEffectCreate,
      effectEdit: SpindleActorSheet.#onEffectEdit,
      effectDelete: SpindleActorSheet.#onEffectDelete,
      effectToggle: SpindleActorSheet.#onEffectToggle
    }
  };

  /** Поля HTML, которые нужно обогатить для отображения. */
  static HTML_FIELDS = [];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    Object.assign(context, {
      actor,
      system: actor.system,
      source: actor.system._source,
      fields: actor.system.schema.fields,
      config: SPINDLE,
      editable: this.isEditable,
      owner: actor.isOwner,
      tabs: this.constructor.TABS?.primary ? this._prepareTabs("primary") : {},
      items: this.#groupItems(),
      effects: actor.effects.contents.toSorted((a, b) => a.sort - b.sort),
      enriched: {}
    });
    for (const path of this.constructor.HTML_FIELDS) {
      const value = foundry.utils.getProperty(actor.system, path) ?? "";
      foundry.utils.setProperty(context.enriched, path, await TextEditor.enrichHTML(value, {
        relativeTo: actor, secrets: actor.isOwner, rollData: actor.getRollData()
      }));
    }
    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tab = context.tabs?.[partId];
    return context;
  }

  #groupItems() {
    const groups = {};
    for (const item of this.document.items.contents.toSorted((a, b) => a.sort - b.sort)) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Редактирование полей предметов прямо в таблицах листа.
    this.element.querySelectorAll("[data-item-field]").forEach(el => {
      el.addEventListener("change", this.#onItemFieldChange.bind(this));
    });
  }

  async #onItemFieldChange(event) {
    event.stopPropagation();
    const el = event.currentTarget;
    const item = this.#getItem(el);
    if (!item) return;
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.dtype === "Number") value = Number(value) || 0;
    await item.update({ [el.dataset.itemField]: value });
  }

  #getItem(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.document.items.get(id) : null;
  }

  #getEffect(target) {
    const id = target.closest("[data-effect-id]")?.dataset.effectId;
    return id ? this.document.effects.get(id) : null;
  }

  /* -------------------------------------------- */
  /*  Действия                                    */
  /* -------------------------------------------- */

  static #onRollAttribute(event, target) {
    return this.document.rollAttribute(target.dataset.attribute, { skipDialog: event.shiftKey });
  }

  static #onRollSkill(event, target) {
    return this.document.rollSkill(target.dataset.skill, { skipDialog: event.shiftKey });
  }

  static async #onItemCreate(event, target) {
    const { type, ...rest } = target.dataset;
    const system = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k.startsWith("system")) {
        const key = k.slice(6);
        system[key.charAt(0).toLowerCase() + key.slice(1)] = v === "true" ? true : v === "false" ? false : v;
      }
    }
    const name = game.i18n.format("DOCUMENT.New", { type: game.i18n.localize(CONFIG.Item.typeLabels[type]) });
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name, type, system }]);
    item?.sheet.render(true);
  }

  static #onItemEdit(event, target) {
    this.#getItem(target)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const item = this.#getItem(target);
    if (!item) return;
    if (!event.shiftKey) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("SPINDLE.DeleteTitle") },
        content: `<p>${game.i18n.format("SPINDLE.DeleteConfirm", { name: item.name })}</p>`
      });
      if (!ok) return;
    }
    return item.delete();
  }

  static #onItemUse(event, target) {
    return this.#getItem(target)?.use({ skipDialog: event.shiftKey });
  }

  static #onTraitActivate(event, target) {
    const item = this.#getItem(target);
    if (item) return this.document.activateTrait(item);
  }

  static #onRollResist(event, target) {
    return this.document.rollResistance(target.dataset.resource);
  }

  static #onRollD66(event, target) {
    return DicePool.rollD66(target.dataset.table, { speaker: ChatMessage.getSpeaker({ actor: this.document }) });
  }

  static #onLongRest() {
    return this.document.longRest?.();
  }

  static #onItemToggle(event, target) {
    const item = this.#getItem(target);
    const field = target.dataset.field;
    if (!item || !field) return;
    return item.update({ [field]: !foundry.utils.getProperty(item, field) });
  }

  static async #onEffectCreate() {
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("SPINDLE.Effect.New"),
      img: "icons/svg/aura.svg"
    }]);
    effect?.sheet.render(true);
  }

  static #onEffectEdit(event, target) {
    this.#getEffect(target)?.sheet.render(true);
  }

  static #onEffectDelete(event, target) {
    return this.#getEffect(target)?.delete();
  }

  static #onEffectToggle(event, target) {
    const effect = this.#getEffect(target);
    return effect?.update({ disabled: !effect.disabled });
  }
}

export const templatePath = path => `systems/${SYSTEM_ID}/templates/${path}`;
