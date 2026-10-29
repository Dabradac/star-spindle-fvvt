import { SpindleActorSheet, templatePath } from "./base-actor-sheet.mjs";
import { prepareAbilities, prepareAttributeRows } from "./character-sheet.mjs";

export class NpcSheet extends SpindleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 760, height: 800 }
  };

  static PARTS = {
    body: { template: templatePath("actor/npc-sheet.hbs"), scrollable: [""] }
  };

  static HTML_FIELDS = ["biography", "injuries", "notes"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.attributeRows = prepareAttributeRows(this.document.system);
    context.abilities = prepareAbilities(context.items.ability);
    return context;
  }
}
