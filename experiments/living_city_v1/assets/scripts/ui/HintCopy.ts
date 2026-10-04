import type { HintResult } from '../hint/HintManager';

export const HINT_READY_MESSAGE = '想找点线索的话，我来帮你。';

/** Clear directions belong to a hint the player deliberately requested. */
export function requestedHintMessage(result: HintResult): string {
    if (result.status === 'shown') {
        const name = result.hint.label.replace(/^(找到|寻找|找一找|找找)\s*/, '');
        if (result.hint.kind !== 'interactiveObject') return `${name}，再看看这个位置。`;
        const cover = result.hint.targetLabel ?? '圈出的物件';
        const verb = /(花叶|叶片|叶丛)/.test(cover) ? '拨开' : /盖/.test(cover) ? '掀开' : '打开';
        return `${name}也许藏在里面。\n${verb}${cover}看看。`;
    }
    if (result.status === 'complete') return '小镇的这些小惊喜，都被你找到了。';
    return '先慢慢逛逛，待会儿再一起找。';
}
