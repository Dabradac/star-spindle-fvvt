import { SpindleActorSheet, templatePath } from "./base-actor-sheet.mjs";

/** Лист наземного или воздушного транспортного средства. */
export class VehicleSheet extends SpindleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["vehicle"],
    position: { width: 760, height: 720 }
  };

  static PARTS = {
    body: { template: templatePath("actor/vehicle-sheet.hbs"), scrollable: [""] }
  };

  static HTML_FIELDS = ["criticals", "description"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.conditionLabel = system.condition === "ok" ? null : `SPINDLE.Vehicle.Condition.${system.condition}`;
    context.rangeLabels = Object.fromEntries(Object.entries(context.config.ranges).map(([k, v]) => [k, v.label]));
    return context;
  }
}
