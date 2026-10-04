import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_READY_MESSAGE, requestedHintMessage } from '../assets/scripts/ui/HintCopy.ts';

test('requested hints remain actionable for a concealed object and name a visible target', () => {
    const hidden = requestedHintMessage({ status: 'shown', hint: { kind: 'interactiveObject', label: '找到书签' } });
    assert.ok(hidden.includes('书签')); assert.ok(hidden.includes('打开圈出的物件'));
    assert.equal(hidden.includes('机关'), false);
    const visible = requestedHintMessage({ status: 'shown', hint: { kind: 'hiddenObject', label: '寻找明信片' } });
    assert.ok(visible.includes('明信片')); assert.ok(visible.includes('这个位置'));
    assert.equal(visible.includes('寻找'), false);
});

test('resting and finished hints use short friendly feedback without directing unsolicited clicks', () => {
    assert.equal(HINT_READY_MESSAGE.includes('点一下'), false);
    assert.ok(requestedHintMessage({ status: 'complete' }).includes('找到了'));
    assert.equal(requestedHintMessage({ status: 'unavailable' }).includes('可提示的目标'), false);
});

test('explicit reveal hints choose the physical action from the configured object name', () => {
    for (const [targetLabel, verb] of [['花叶', '拨开'], ['蒸笼盖布', '掀开'],
        ['包裹箱', '打开'], ['读书包', '打开'], ['园艺工具箱', '打开'], ['野餐篮', '打开']]) {
        const copy = requestedHintMessage({ status: 'shown', hint: {
            kind: 'interactiveObject', label: '找到小惊喜', targetLabel,
        } });
        assert.ok(copy.includes(`${verb}${targetLabel}`), `${targetLabel}: action describes its physical reveal`);
    }
});
