// SVG 资源加载器
// 使用 Vite ?raw 将所有 SVG 内联为字符串，供 DOM innerHTML 或 canvas drawImage 使用

// ===== towers =====
import tower_arrow from '../../assets/towers/tower_arrow.svg?raw';
import tower_cannon from '../../assets/towers/tower_cannon.svg?raw';
import tower_splash from '../../assets/towers/tower_splash.svg?raw';
import tower_chaos from '../../assets/towers/tower_chaos.svg?raw';
import tower_lightning from '../../assets/towers/tower_lightning.svg?raw';
import tower_frost from '../../assets/towers/tower_frost.svg?raw';
import tower_corrosive from '../../assets/towers/tower_corrosive.svg?raw';
import tower_stun from '../../assets/towers/tower_stun.svg?raw';
import tower_freeze from '../../assets/towers/tower_freeze.svg?raw';
import tower_auraDamage from '../../assets/towers/tower_auraDamage.svg?raw';
import tower_auraHaste from '../../assets/towers/tower_auraHaste.svg?raw';
import tower_auraSlow from '../../assets/towers/tower_auraSlow.svg?raw';
import tower_tianshen from '../../assets/towers/tower_tianshen.svg?raw';
import tower_jianfa from '../../assets/towers/tower_jianfa.svg?raw';
import tower_dianfa from '../../assets/towers/tower_dianfa.svg?raw';

// ===== icons =====
import icon_blast from '../../assets/icons/icon_blast.svg?raw';
import icon_slowGlobal from '../../assets/icons/icon_slowGlobal.svg?raw';
import icon_summon from '../../assets/icons/icon_summon.svg?raw';
import icon_slow from '../../assets/icons/icon_slow.svg?raw';
import icon_armorBreak from '../../assets/icons/icon_armorBreak.svg?raw';
import icon_stun from '../../assets/icons/icon_stun.svg?raw';
import icon_freeze from '../../assets/icons/icon_freeze.svg?raw';
import icon_haste from '../../assets/icons/icon_haste.svg?raw';
import icon_bladeStorm from '../../assets/icons/icon_bladeStorm.svg?raw';
import icon_chainLightning from '../../assets/icons/icon_chainLightning.svg?raw';
import icon_criticalStrike from '../../assets/icons/icon_criticalStrike.svg?raw';
import icon_holyShield from '../../assets/icons/icon_holyShield.svg?raw';
import icon_judge from '../../assets/icons/icon_judge.svg?raw';
import icon_poison from '../../assets/icons/icon_poison.svg?raw';
import icon_thunderStorm from '../../assets/icons/icon_thunderStorm.svg?raw';

// ===== tiles =====
import tile_path from '../../assets/tiles/tile_path.svg?raw';
import tile_buildable from '../../assets/tiles/tile_buildable.svg?raw';
import tile_blocked from '../../assets/tiles/tile_blocked.svg?raw';

// ===== projectiles =====
import proj_arrow from '../../assets/projectiles/proj_arrow.svg?raw';
import proj_cannon from '../../assets/projectiles/proj_cannon.svg?raw';
import proj_splash from '../../assets/projectiles/proj_splash.svg?raw';
import proj_chaos from '../../assets/projectiles/proj_chaos.svg?raw';
import proj_frost from '../../assets/projectiles/proj_frost.svg?raw';
import proj_corrosive from '../../assets/projectiles/proj_corrosive.svg?raw';
import proj_freeze from '../../assets/projectiles/proj_freeze.svg?raw';
import proj_tianshen from '../../assets/projectiles/proj_tianshen.svg?raw';
import proj_jianfa from '../../assets/projectiles/proj_jianfa.svg?raw';

const towerSvgs: Record<string, string> = {
  arrow: tower_arrow,
  cannon: tower_cannon,
  splash: tower_splash,
  chaos: tower_chaos,
  lightning: tower_lightning,
  frost: tower_frost,
  corrosive: tower_corrosive,
  stun: tower_stun,
  freeze: tower_freeze,
  auraDamage: tower_auraDamage,
  auraHaste: tower_auraHaste,
  auraSlow: tower_auraSlow,
  tianshen: tower_tianshen,
  jianfa: tower_jianfa,
  dianfa: tower_dianfa,
};

const iconSvgs: Record<string, string> = {
  blast: icon_blast,
  slowGlobal: icon_slowGlobal,
  summon: icon_summon,
  slow: icon_slow,
  armorBreak: icon_armorBreak,
  stun: icon_stun,
  freeze: icon_freeze,
  haste: icon_haste,
  bladeStorm: icon_bladeStorm,
  chainLightning: icon_chainLightning,
  criticalStrike: icon_criticalStrike,
  holyShield: icon_holyShield,
  judge: icon_judge,
  poison: icon_poison,
  thunderStorm: icon_thunderStorm,
};

const tileSvgs: Record<string, string> = {
  path: tile_path,
  buildable: tile_buildable,
  blocked: tile_blocked,
};

const projectileSvgs: Record<string, string> = {
  arrow: proj_arrow,
  cannon: proj_cannon,
  splash: proj_splash,
  chaos: proj_chaos,
  frost: proj_frost,
  corrosive: proj_corrosive,
  freeze: proj_freeze,
  tianshen: proj_tianshen,
  jianfa: proj_jianfa,
};

/** 获取塔 SVG 字符串，未找到返回空串 */
export function getTowerSvg(id: string): string {
  return towerSvgs[id] ?? '';
}

/** 获取图标 SVG 字符串 */
export function getIconSvg(id: string): string {
  return iconSvgs[id] ?? '';
}

/** 获取地块 SVG 字符串 */
export function getTileSvg(id: string): string {
  return tileSvgs[id] ?? '';
}

// canvas 用 Image 缓存
const imageCache: Record<string, HTMLImageElement> = {};

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** 获取 SVG 对应的 Image 对象（缓存），用于 canvas drawImage */
export function getSvgImage(id: string, source: 'tower' | 'icon' | 'tile' | 'projectile'): HTMLImageElement | null {
  const key = `${source}:${id}`;
  const svg =
    source === 'tower' ? towerSvgs[id] :
    source === 'icon' ? iconSvgs[id] :
    source === 'tile' ? tileSvgs[id] :
    projectileSvgs[id];
  if (!svg) return null;

  let img = imageCache[key];
  if (!img) {
    img = new Image();
    img.src = svgToDataUrl(svg);
    imageCache[key] = img;
  }
  return img;
}

/** 等待关键图片加载完成（可选，首次绘制前调用） */
export function preloadImages(): Promise<void> {
  const allIds: { id: string; source: 'tower' | 'icon' | 'tile' | 'projectile' }[] = [
    ...Object.keys(towerSvgs).map((id) => ({ id, source: 'tower' as const })),
    ...Object.keys(iconSvgs).map((id) => ({ id, source: 'icon' as const })),
    ...Object.keys(tileSvgs).map((id) => ({ id, source: 'tile' as const })),
    ...Object.keys(projectileSvgs).map((id) => ({ id, source: 'projectile' as const })),
  ];
  return Promise.all(
    allIds.map(
      ({ id, source }) =>
        new Promise<void>((resolve) => {
          const img = getSvgImage(id, source);
          if (!img || img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}
