import { SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Универсальный лист предмета: поля строятся по схеме данных типа предмета.
 */
export class SpindleItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["star-spindle", "sheet", "item"],
    position: { width: 560, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      effectCreate: SpindleItemSheet.#onEffectCreate,
      effectEdit: SpindleItemSheet.#onEffectEdit,
      effectDelete: SpindleItemSheet.#onEffectDelete,
      effectToggle: SpindleItemSheet.#onEffectToggle
    }
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/item/item-sheet.hbs`, scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const disabled = !this.isEditable;
    const groups = [];
    for (const [name, field] of Object.entries(item.system.schema.fields)) {
      if (name === "description") continue;
      this.#collectFields(field, `system.${name}`, groups, disabled);
    }
    Object.assign(context, {
      item,
      system: item.system,
      fields: item.system.schema.fields,
      editable: this.isEditable,
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels[item.type]),
      formGroups: groups,
      effects: item.effects.contents,
      enrichedDescription: await TextEditor.enrichHTML(item.system.description ?? "", {
        relativeTo: item, secrets: item.isOwner, rollData: item.actor?.getRollData() ?? {}
      })
    });
    return context;
  }

  /** Превратить поле схемы (и вложенные поля) в HTML группы формы. */
  #collectFields(field, path, groups, disabled) {
    if (field instanceof foundry.data.fields.SchemaField) {
      for (const [name, sub] of Object.entries(field.fields)) {
        this.#collectFields(sub, `${path}.${name}`, groups, disabled);
      }
      return;
    }
    const value = foundry.utils.getProperty(this.document, path);
    const input = { name: path, value, disabled, localize: true };
    const choiceSource = field instanceof foundry.data.fields.SetField ? field.element : field;
    if (typeof choiceSource.choices === "function") input.choices = choiceSource.choices();
    if (field instanceof foundry.data.fields.SetField) {
      input.type = "checkboxes";
      input.value = Array.from(value ?? []);
    }
    const group = field.toFormGroup({ label: field.label, localize: true, classes: [field.constructor.name] }, input);
    groups.push(group.outerHTML);
  }

  /* -------------------------------------------- */

  #getEffect(target) {
    const id = target.closest("[data-effect-id]")?.dataset.effectId;
    return id ? this.document.effects.get(id) : null;
  }

  static async #onEffectCreate() {
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [{
      name: this.document.name, img: this.document.img, transfer: true
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
