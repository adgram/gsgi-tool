/**
 * 颜色解析工具：ACI 色号 → 十六进制 / entity 颜色解析（支持 ByLayer / ByBlock）
 */
import { Entity } from './entity';

export class ColorResolver {
  static aciToHex(aci: number): string {
    const map: Record<number, string> = {
      0: '#000', 1: '#F00', 2: '#FF0', 3: '#0F0', 4: '#0FF',
      5: '#00F', 6: '#F0F', 7: '#FFF', 8: '#808080', 9: '#C0C0C0'
    };
    return map[aci] || '#CCC';
  }

  static resolveColorValue(c: number | string | undefined): string {
    if (typeof c === 'number') return ColorResolver.aciToHex(c);
    if (typeof c === 'string' && c.startsWith('#')) return c;
    return '#FFF';
  }

  static resolveColor(entity: Entity, layers: { id: string; color?: number | string }[]): string {
    const c = entity.color;
    if (c === 'ByLayer' || c === undefined || c === null) {
      const layer = layers.find(l => l.id === entity.layer);
      return layer ? ColorResolver.resolveColorValue(layer.color) : '#FFF';
    }
    if (c === 'ByBlock') return '#FFF';
    return ColorResolver.resolveColorValue(c);
  }
}
