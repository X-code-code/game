import type { CityCatalog, CityConfig } from './CityTypes';

/** Validate untrusted JSON before it is used to create a city scene. */

function invalid(context: string, path: string, reason: string): never {
    throw new Error(`${context} ${path}: ${reason}`);
}

function record(value: unknown, context: string, path: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        invalid(context, path, 'expected an object');
    }
    return value as Record<string, unknown>;
}

function array(value: unknown, context: string, path: string): unknown[] {
    if (!Array.isArray(value)) invalid(context, path, 'expected an array');
    return value;
}

function nonEmptyString(value: unknown, context: string, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        invalid(context, path, 'expected a non-empty string');
    }
    return value;
}

function boolean(value: unknown, context: string, path: string): void {
    if (typeof value !== 'boolean') invalid(context, path, 'expected a boolean');
}

function finiteNumber(value: unknown, context: string, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        invalid(context, path, 'expected a finite number');
    }
    return value;
}

function positiveNumber(value: unknown, context: string, path: string): number {
    const number = finiteNumber(value, context, path);
    if (number <= 0) invalid(context, path, 'must be greater than zero');
    return number;
}

function nonNegativeNumber(value: unknown, context: string, path: string): number {
    const number = finiteNumber(value, context, path);
    if (number < 0) invalid(context, path, 'must not be negative');
    return number;
}

function fraction(value: unknown, context: string, path: string): number {
    const number = finiteNumber(value, context, path);
    if (number < 0 || number > 1) invalid(context, path, 'must be between 0 and 1');
    return number;
}

function oneOf(value: unknown, allowed: readonly string[], context: string, path: string): string {
    if (typeof value !== 'string' || allowed.indexOf(value) < 0) {
        invalid(context, path, `expected one of ${allowed.join(', ')}`);
    }
    return value;
}

function stringArray(value: unknown, context: string, path: string): string[] {
    return array(value, context, path).map((item, index) =>
        nonEmptyString(item, context, `${path}[${index}]`));
}

function optionalCondition(value: unknown, context: string, path: string): void {
    if (value === undefined) return;
    const condition = record(value, context, path);
    nonEmptyString(condition.objectId, context, `${path}.objectId`);
    nonEmptyString(condition.state, context, `${path}.state`);
}

function optionalVisualSize(value: unknown, context: string, path: string): void {
    if (value === undefined) return;
    const size = record(value, context, path);
    positiveNumber(size.width, context, `${path}.width`);
    positiveNumber(size.height, context, `${path}.height`);
}

function clickArea(value: unknown, context: string, path: string): void {
    const area = record(value, context, path);
    const shape = oneOf(area.shape, ['rect', 'circle'], context, `${path}.shape`);
    if (shape === 'rect') {
        positiveNumber(area.width, context, `${path}.width`);
        positiveNumber(area.height, context, `${path}.height`);
    } else {
        positiveNumber(area.radius, context, `${path}.radius`);
    }
    if (area.offset !== undefined) {
        const offset = record(area.offset, context, `${path}.offset`);
        finiteNumber(offset.x, context, `${path}.offset.x`);
        finiteNumber(offset.y, context, `${path}.offset.y`);
    }
}

function entityBase(entity: Record<string, unknown>, context: string, path: string): string {
    const id = nonEmptyString(entity.id, context, `${path}.id`);
    fraction(entity.x, context, `${path}.x`);
    fraction(entity.y, context, `${path}.y`);
    positiveNumber(entity.scale, context, `${path}.scale`);
    clickArea(entity.clickArea, context, `${path}.clickArea`);
    stringArray(entity.tags, context, `${path}.tags`);
    boolean(entity.targetable, context, `${path}.targetable`);
    return id;
}

function chickenBehavior(chicken: Record<string, unknown>, context: string, path: string): void {
    const type = oneOf(chicken.behaviorType, ['idle', 'walk', 'peck', 'sleep'], context,
        `${path}.behaviorType`);
    const settings = record(chicken.behaviorConfig, context, `${path}.behaviorConfig`);
    const settingPath = `${path}.behaviorConfig`;
    if (type === 'idle') {
        if (settings.bobHeight !== undefined) nonNegativeNumber(settings.bobHeight, context, `${settingPath}.bobHeight`);
        if (settings.blinkInterval !== undefined) positiveNumber(settings.blinkInterval, context, `${settingPath}.blinkInterval`);
    } else if (type === 'walk') {
        if (settings.bobHeight !== undefined) nonNegativeNumber(settings.bobHeight, context, `${settingPath}.bobHeight`);
        if (settings.pauseSeconds !== undefined) nonNegativeNumber(settings.pauseSeconds, context, `${settingPath}.pauseSeconds`);
        positiveNumber(chicken.speed, context, `${path}.speed`);
        const range = record(chicken.movementRange, context, `${path}.movementRange`);
        const minX = fraction(range.minX, context, `${path}.movementRange.minX`);
        const maxX = fraction(range.maxX, context, `${path}.movementRange.maxX`);
        if (minX > maxX) invalid(context, `${path}.movementRange`, 'minX exceeds maxX');
        const x = chicken.x as number;
        if (x < minX || x > maxX) invalid(context, `${path}.x`, 'walk start lies outside movementRange');
    } else if (type === 'peck') {
        if (settings.pecksPerCycle !== undefined && settings.pecksPerCycle !== 2 && settings.pecksPerCycle !== 3) {
            invalid(context, `${settingPath}.pecksPerCycle`, 'expected 2 or 3');
        }
        if (settings.pauseSeconds !== undefined) nonNegativeNumber(settings.pauseSeconds, context, `${settingPath}.pauseSeconds`);
    } else {
        if (settings.breathScale !== undefined) nonNegativeNumber(settings.breathScale, context, `${settingPath}.breathScale`);
        if (settings.showZzz !== undefined) boolean(settings.showZzz, context, `${settingPath}.showZzz`);
    }
    if (type !== 'walk' && (chicken.speed !== undefined || chicken.movementRange !== undefined)) {
        invalid(context, `${path}.behaviorType`, 'speed and movementRange are only valid for walk');
    }
}

/** Validate the small startup catalog that maps city IDs to Asset Bundles. */
export function validateCityCatalog(raw: unknown): CityCatalog {
    const context = 'CityCatalog';
    const catalog = record(raw, context, '$');
    if (catalog.schemaVersion !== 1) invalid(context, '$.schemaVersion', 'unsupported version; expected 1');
    const cities = array(catalog.cities, context, '$.cities');
    if (cities.length === 0) invalid(context, '$.cities', 'at least one city is required');
    const ids = new Set<string>();
    cities.forEach((value, index) => {
        const path = `$.cities[${index}]`;
        const entry = record(value, context, path);
        const id = nonEmptyString(entry.cityId, context, `${path}.cityId`);
        nonEmptyString(entry.bundleName, context, `${path}.bundleName`);
        if (ids.has(id)) invalid(context, `${path}.cityId`, `duplicate city ID ${id}`);
        ids.add(id);
    });
    const initial = nonEmptyString(catalog.initialCityId, context, '$.initialCityId');
    if (!ids.has(initial)) invalid(context, '$.initialCityId', `unknown city ID ${initial}`);
    return raw as CityCatalog;
}

/** Validate one CityConfig and all of its local and catalog references. */
export function validateCityConfig(raw: unknown, catalog: CityCatalog, expectedCityId: string): CityConfig {
    const context = `CityConfig ${expectedCityId}`;
    nonEmptyString(expectedCityId, context, '$.cityId');
    if (!catalog.cities.some(entry => entry.cityId === expectedCityId)) {
        invalid(context, '$.cityId', 'city is absent from CityCatalog');
    }
    const city = record(raw, context, '$');
    if (city.schemaVersion !== 1) invalid(context, '$.schemaVersion', 'unsupported version; expected 1');
    if (nonEmptyString(city.cityId, context, '$.cityId') !== expectedCityId) {
        invalid(context, '$.cityId', `expected ${expectedCityId}`);
    }
    nonEmptyString(city.cityName, context, '$.cityName');
    nonEmptyString(city.background, context, '$.background');
    if (city.sceneBlueprint !== undefined) nonEmptyString(city.sceneBlueprint, context, '$.sceneBlueprint');
    if (city.chapterIndex !== undefined || city.chapterCount !== undefined) {
        const index = positiveNumber(city.chapterIndex, context, '$.chapterIndex');
        const total = positiveNumber(city.chapterCount, context, '$.chapterCount');
        if (!Number.isInteger(index) || !Number.isInteger(total) || index > total) {
            invalid(context, '$.chapterIndex', 'chapter numbers must be integers with index at most count');
        }
    }
    const mapSize = record(city.mapSize, context, '$.mapSize');
    const mapWidth = positiveNumber(mapSize.width, context, '$.mapSize.width');
    const mapHeight = positiveNumber(mapSize.height, context, '$.mapSize.height');
    const view = record(city.view, context, '$.view');
    const minZoom = positiveNumber(view.minZoom, context, '$.view.minZoom');
    if (minZoom < 1) invalid(context, '$.view.minZoom', 'must be at least 1 to cover the viewport');
    const maxZoom = positiveNumber(view.maxZoom, context, '$.view.maxZoom');
    if (minZoom > maxZoom) invalid(context, '$.view.maxZoom', 'must be at least minZoom');
    if (view.initialZoom !== undefined) {
        const initialZoom = positiveNumber(view.initialZoom, context, '$.view.initialZoom');
        if (initialZoom < minZoom || initialZoom > maxZoom) {
            invalid(context, '$.view.initialZoom', 'must be between minZoom and maxZoom');
        }
    }

    const entityIds = new Set<string>();
    const entityPaths = new Map<string, string>();
    const hiddenIds = new Set<string>();
    const chickenIds = new Set<string>();
    const chickenTags = new Set<string>();
    const interactiveIds = new Set<string>();
    const interactiveStates = new Map<string, Set<string>>();
    const remember = (id: string, path: string): void => {
        if (entityIds.has(id)) invalid(context, `${path}.id`, `duplicate entity ID ${id}; first at ${entityPaths.get(id)}`);
        entityIds.add(id);
        entityPaths.set(id, path);
    };

    array(city.hiddenObjects, context, '$.hiddenObjects').forEach((value, index) => {
        const path = `$.hiddenObjects[${index}]`;
        const object = record(value, context, path);
        const id = entityBase(object, context, path);
        remember(id, path);
        hiddenIds.add(id);
        nonEmptyString(object.asset, context, `${path}.asset`);
        optionalVisualSize(object.visualSize, context, `${path}.visualSize`);
        if (object.displayName !== undefined) nonEmptyString(object.displayName, context, `${path}.displayName`);
        if (object.clue !== undefined) nonEmptyString(object.clue, context, `${path}.clue`);
        finiteNumber(object.rotation, context, `${path}.rotation`);
        if (object.depthY !== undefined) {
            const depthY = finiteNumber(object.depthY, context, `${path}.depthY`);
            if (Math.abs(depthY) > mapHeight / 2) invalid(context, `${path}.depthY`, 'outside map');
        }
        optionalCondition(object.visibleCondition, context, `${path}.visibleCondition`);
    });
    array(city.chickens, context, '$.chickens').forEach((value, index) => {
        const path = `$.chickens[${index}]`;
        const chicken = record(value, context, path);
        const id = entityBase(chicken, context, path);
        remember(id, path);
        chickenIds.add(id);
        nonEmptyString(chicken.skin, context, `${path}.skin`);
        oneOf(chicken.facing, ['left', 'right'], context, `${path}.facing`);
        if (chicken.carryItem !== undefined) nonEmptyString(chicken.carryItem, context, `${path}.carryItem`);
        stringArray(chicken.accessories, context, `${path}.accessories`);
        optionalCondition(chicken.visibleCondition, context, `${path}.visibleCondition`);
        if (chicken.depthY !== undefined) {
            const depthY = finiteNumber(chicken.depthY, context, `${path}.depthY`);
            if (Math.abs(depthY) > mapHeight / 2) invalid(context, `${path}.depthY`, 'outside map');
        }
        if (chicken.visualSize !== undefined) {
            const visualSize = record(chicken.visualSize, context, `${path}.visualSize`);
            positiveNumber(visualSize.width, context, `${path}.visualSize.width`);
            positiveNumber(visualSize.height, context, `${path}.visualSize.height`);
        }
        if (chicken.animation !== undefined) {
            const animation = record(chicken.animation, context, `${path}.animation`);
            const frames = stringArray(animation.frames, context, `${path}.animation.frames`);
            if (frames.length < 2 || new Set(frames).size < 2) {
                invalid(context, `${path}.animation.frames`, 'expected at least two different frames');
            }
            positiveNumber(animation.frameDurationSeconds, context, `${path}.animation.frameDurationSeconds`);
        }
        chickenBehavior(chicken, context, path);
        if (chicken.targetable === true) {
            (chicken.tags as string[]).forEach(tag => chickenTags.add(tag));
        }
    });
    array(city.interactiveObjects, context, '$.interactiveObjects').forEach((value, index) => {
        const path = `$.interactiveObjects[${index}]`;
        const object = record(value, context, path);
        const id = entityBase(object, context, path);
        remember(id, path);
        interactiveIds.add(id);
        nonEmptyString(object.asset, context, `${path}.asset`);
        if (object.openAsset !== undefined) nonEmptyString(object.openAsset, context, `${path}.openAsset`);
        if (object.openForegroundStart !== undefined) {
            const start = finiteNumber(object.openForegroundStart, context, `${path}.openForegroundStart`);
            if (start <= 0 || start >= 1 || !object.openAsset) invalid(context, `${path}.openForegroundStart`, 'expected openAsset and a fraction between 0 and 1');
        }
        optionalVisualSize(object.visualSize, context, `${path}.visualSize`);
        if (object.depthY !== undefined && Math.abs(finiteNumber(object.depthY, context, `${path}.depthY`)) > mapHeight / 2) {
            invalid(context, `${path}.depthY`, 'outside map');
        }
        finiteNumber(object.rotation, context, `${path}.rotation`);
        const initialState = nonEmptyString(object.initialState, context, `${path}.initialState`);
        interactiveStates.set(id, new Set([initialState]));
        if (object.conditions !== undefined) {
            array(object.conditions, context, `${path}.conditions`).forEach((condition, conditionIndex) =>
                optionalCondition(condition, context, `${path}.conditions[${conditionIndex}]`));
        }
        array(object.actions, context, `${path}.actions`).forEach((value, actionIndex) => {
            const actionPath = `${path}.actions[${actionIndex}]`;
            const action = record(value, context, actionPath);
            oneOf(action.type, ['setState'], context, `${actionPath}.type`);
            nonEmptyString(action.objectId, context, `${actionPath}.objectId`);
            nonEmptyString(action.state, context, `${actionPath}.state`);
        });
    });
    if (city.foregroundSprites !== undefined) {
        array(city.foregroundSprites, context, '$.foregroundSprites').forEach((value, index) => {
            const path = `$.foregroundSprites[${index}]`;
            const sprite = record(value, context, path);
            remember(nonEmptyString(sprite.id, context, `${path}.id`), path);
            nonEmptyString(sprite.asset, context, `${path}.asset`);
            const x = finiteNumber(sprite.x, context, `${path}.x`);
            const y = finiteNumber(sprite.y, context, `${path}.y`);
            const footY = finiteNumber(sprite.footY, context, `${path}.footY`);
            if (Math.abs(x) > mapWidth / 2) invalid(context, `${path}.x`, 'outside map');
            if (Math.abs(y) > mapHeight / 2) invalid(context, `${path}.y`, 'outside map');
            if (Math.abs(footY) > mapHeight / 2) invalid(context, `${path}.footY`, 'outside map');
            positiveNumber(sprite.width, context, `${path}.width`);
            positiveNumber(sprite.height, context, `${path}.height`);
            if (sprite.rotation !== undefined) finiteNumber(sprite.rotation, context, `${path}.rotation`);
        });
    }

    // Actions establish the states that visible conditions may reference.
    (city.interactiveObjects as Record<string, unknown>[]).forEach((object, index) => {
        (object.actions as Record<string, unknown>[]).forEach((action, actionIndex) => {
            const targetId = action.objectId as string;
            const states = interactiveStates.get(targetId);
            if (!states) {
                invalid(context, `$.interactiveObjects[${index}].actions[${actionIndex}].objectId`,
                    `unknown interactive object ${targetId}`);
            }
            states.add(action.state as string);
        });
    });
    const checkConditionReference = (value: unknown, path: string): void => {
        if (value === undefined) return;
        const condition = value as { objectId: string; state: string };
        if (!interactiveIds.has(condition.objectId)) {
            invalid(context, `${path}.objectId`, `unknown interactive object ${condition.objectId}`);
        }
        if (!interactiveStates.get(condition.objectId)?.has(condition.state)) {
            invalid(context, `${path}.state`, `state ${condition.state} is never defined for ${condition.objectId}`);
        }
    };
    (city.hiddenObjects as Record<string, unknown>[]).forEach((object, index) =>
        checkConditionReference(object.visibleCondition, `$.hiddenObjects[${index}].visibleCondition`));
    (city.chickens as Record<string, unknown>[]).forEach((chicken, index) =>
        checkConditionReference(chicken.visibleCondition, `$.chickens[${index}].visibleCondition`));
    (city.interactiveObjects as Record<string, unknown>[]).forEach((object, index) => {
        (object.conditions as unknown[] | undefined)?.forEach((condition, conditionIndex) =>
            checkConditionReference(condition, `$.interactiveObjects[${index}].conditions[${conditionIndex}]`));
    });

    const taskIds = new Set<string>();
    array(city.tasks, context, '$.tasks').forEach((value, index) => {
        const path = `$.tasks[${index}]`;
        const task = record(value, context, path);
        const id = nonEmptyString(task.id, context, `${path}.id`);
        if (taskIds.has(id)) invalid(context, `${path}.id`, `duplicate task ID ${id}`);
        taskIds.add(id);
        nonEmptyString(task.label, context, `${path}.label`);
        boolean(task.required, context, `${path}.required`);
        const type = oneOf(task.type, ['hiddenObject', 'chickenId', 'chickenTag'], context, `${path}.type`);
        if (type === 'chickenTag') {
            const tag = nonEmptyString(task.targetTag, context, `${path}.targetTag`);
            if (!chickenTags.has(tag)) invalid(context, `${path}.targetTag`, `no targetable chicken has tag ${tag}`);
        } else {
            const targetId = nonEmptyString(task.targetId, context, `${path}.targetId`);
            const validSet = type === 'hiddenObject' ? hiddenIds : chickenIds;
            if (!validSet.has(targetId)) invalid(context, `${path}.targetId`, `unknown ${type} ${targetId}`);
            const source = type === 'hiddenObject' ? city.hiddenObjects : city.chickens;
            const target = (source as Record<string, unknown>[]).find(entity => entity.id === targetId);
            if (target?.targetable !== true) invalid(context, `${path}.targetId`, `${targetId} is not targetable`);
        }
    });

    if (city.nextCityId !== null) {
        const next = nonEmptyString(city.nextCityId, context, '$.nextCityId');
        if (!catalog.cities.some(entry => entry.cityId === next)) {
            invalid(context, '$.nextCityId', `unknown city ID ${next}`);
        }
    }
    if (city.travelType !== undefined) {
        oneOf(city.travelType, ['train', 'bus', 'plane', 'boat', 'other'], context, '$.travelType');
    }
    if (city.souvenir !== undefined) nonEmptyString(city.souvenir, context, '$.souvenir');
    if (city.optionalContent !== undefined) {
        const optional = record(city.optionalContent, context, '$.optionalContent');
        if (optional.description !== undefined && typeof optional.description !== 'string') {
            invalid(context, '$.optionalContent.description', 'expected a string');
        }
        if (optional.collectibleIds !== undefined) {
            stringArray(optional.collectibleIds, context, '$.optionalContent.collectibleIds').forEach((id, index) => {
                if (!entityIds.has(id)) {
                    invalid(context, `$.optionalContent.collectibleIds[${index}]`, `unknown entity ${id}`);
                }
            });
        }
    }
    return raw as CityConfig;
}
