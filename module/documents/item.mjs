export class SpindleItem extends Item {
  /** @override */
  static getDefaultArtwork(itemData) {
    const icons = {
      weapon: "icons/svg/sword.svg",
      armor: "icons/svg/shield.svg",
      gear: "icons/svg/item-bag.svg",
      implant: "icons/svg/pawprint.svg",
      ability: "icons/svg/book.svg",
      trait: "icons/svg/aura.svg",
      specialization: "icons/svg/mystery-man.svg",
      injury: "icons/svg/blood.svg",
      shipWeapon: "icons/svg/explosion.svg",
      shipModule: "icons/svg/circle.svg",
      shipUpgrade: "icons/svg/upgrade.svg",
      cargo: "icons/svg/chest.svg"
    };
    return { img: icons[itemData.type] ?? super.getDefaultArtwork(itemData).img };
  }

  /** Предмет можно носить с собой или оставить на хранении в каюте. */
  get isCarryable() {
    return "stored" in this.system;
  }

  /** Использовать предмет: оружие атакует, способность и черта применяются, остальное — в чат. */
  async use(options = {}) {
    const actor = this.actor;
    if (actor) {
      if (this.type === "weapon") return actor.rollWeapon(this, options);
      if ((this.type === "ability") && this.system.active) return actor.useAbility(this);
    }
    return this.toChat();
  }

  async toChat({ note } = {}) {
    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.system.description ?? "", { relativeTo: this, secrets: this.isOwner }
    );
    const content = `<div class="star-spindle item-card">
      <header><img src="${this.img}" alt=""><h3>${this.name}</h3></header>
      ${note ? `<p class="item-card-note">${note}</p>` : ""}
      <div class="item-card-description">${description}</div>
    </div>`;
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }
}
