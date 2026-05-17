export class HUD {
  constructor() {
    this.hpFill      = document.getElementById('hp-fill');
    this.enemyHpFill = document.getElementById('enemy-hp-fill');
    this.beamCd      = document.getElementById('beam-cd');
    this.colorTimer  = document.getElementById('color-timer');
  }

  update(player, kaiju) {
    const hpRatio = player.hp / player.maxHp;
    this.hpFill.style.width = (hpRatio * 100) + '%';

    const enemyRatio = kaiju.hp / kaiju.maxHp;
    this.enemyHpFill.style.width = (enemyRatio * 100) + '%';

    if (player.beamCooldown > 0) {
      this.beamCd.textContent = `光線冷卻 ${player.beamCooldown.toFixed(1)} s`;
      this.beamCd.style.color = '#bbb';
    } else {
      this.beamCd.textContent = '光線 就緒 (F)';
      this.beamCd.style.color = '#aaffaa';
    }

    this.colorTimer.classList.remove('warn', 'danger');
    if (hpRatio < 0.3)      this.colorTimer.classList.add('danger');
    else if (hpRatio < 0.6) this.colorTimer.classList.add('warn');
  }
}
