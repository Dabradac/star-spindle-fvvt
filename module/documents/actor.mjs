import { SPINDLE } from "../config.mjs";
import { DicePool } from "../dice/pool.mjs";
import { Chernobog } from "../chernobog.mjs";

export class SpindleActor extends Actor {
  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const prototypeToken = {};
    if (this.type === "character") Object.assign(prototypeToken, { actorLink: true, disposition: 1 });
    if (["ship", "vehicle"].includes(this.type)) Object.assign(prototypeToken, { actorLink: true });
    this.updateSource({ prototypeToken });
  }

  /**
   * У персонажа может быть только одна специализация: новая заменяет старую.
   * @override
   */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ((userId !== game.user.id) || (collection !== "items")) return;
    const added = documents.filter(d => d.type === "specialization");
    if (!added.length) return;
    const keep = added.at(-1).id;
    const stale = this.items.filter(i => (i.type === "specialization") && (i.id !== keep)).map(i => i.id);
    if (stale.length) this.deleteEmbeddedDocuments("Item", stale);
  }

  getRollData() {
    return { initiative: 0, ...super.getRollData(), ...(this.system.getRollData?.() ?? {}) };
  }

  /* -------------------------------------------- */
  /*  Проверки                                    */
  /* -------------------------------------------- */

  /** Проверка характеристики. */
  rollAttribute(attribute, options = {}) {
    return DicePool.check({ actor: this, attribute, ...options });
  }

  /** Проверка навыка (навык + связанная характеристика). */
  rollSkill(skill, options = {}) {
    if (!SPINDLE.skills[skill]) return null;
    return DicePool.check({ actor: this, skill, ...options });
  }

  /** Атака оружием. */
  async rollWeapon(item, options = {}) {
    const ammo = item.system.ammo;
    if ((ammo?.max > 0) && (ammo.value <= 0)) {
      return ui.notifications.warn(game.i18n.format("SPINDLE.Roll.NoAmmo", { name: item.name }));
    }
    const result = await DicePool.check({
      actor: this, skill: item.system.skill, item, title: item.name, ...options
    });
    if (result && (ammo?.max > 0)) await item.update({ "system.ammo.value": ammo.value - 1 });
    return result;
  }

  /** Проверка здоровья или воли против силы воздействия. */
  rollResistance(resource) {
    return DicePool.resist(this, resource);
  }

  /* -------------------------------------------- */
  /*  Особые способности и черты                  */
  /* -------------------------------------------- */

  /**
   * Применить активную особую способность: −1 Воля, Мастеру жетон Чернобога,
   * повторно — только после длительного отдыха.
   */
  async useAbility(item) {
    if (!item.system.active) return item.toChat();
    if (item.system.used) {
      return ui.notifications.warn(game.i18n.format("SPINDLE.Ability.AlreadyUsed", { name: item.name }));
    }
    await this.update({ "system.will.value": this.system.will.value - 1 });
    await item.update({ "system.used": true });
    await Chernobog.add(1, game.i18n.format("SPINDLE.Chernobog.Ability", { name: this.name, ability: item.name }));
    return item.toChat({ note: game.i18n.localize("SPINDLE.Ability.Used") });
  }

  /**
   * Активировать черту: положительная по желанию игрока даёт Мастеру жетон,
   * отрицательная по желанию Мастера стоит ему жетон.
   */
  async activateTrait(item) {
    if (item.system.kind === "positive") {
      await Chernobog.add(1, game.i18n.format("SPINDLE.Chernobog.Trait", { name: this.name, trait: item.name }));
    } else {
      if (!game.user.isGM) return ui.notifications.warn("SPINDLE.Trait.GmOnly", { localize: true });
      const ok = await Chernobog.spend(1, game.i18n.format("SPINDLE.Chernobog.NegativeTrait", { name: this.name, trait: item.name }));
      if (!ok) return;
    }
    return item.toChat({ note: game.i18n.localize("SPINDLE.Trait.Activated") });
  }

  /** Длительный отдых: активные способности снова доступны. */
  async longRest() {
    const updates = this.items.filter(i => i.type === "ability" && i.system.used)
      .map(i => ({ _id: i.id, "system.used": false }));
    if (updates.length) await this.updateEmbeddedDocuments("Item", updates);
    ui.notifications.info(game.i18n.format("SPINDLE.Rest.Done", { name: this.name }));
  }
}
