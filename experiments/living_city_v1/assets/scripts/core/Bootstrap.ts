import { _decorator, Color, Component, director, error, Label, Node, UITransform } from 'cc';
import { CityContentLoader } from '../config/CityContentLoader';
import { CityManager } from '../city/CityManager';

const { ccclass } = _decorator;

/** Loads and validates the first city before mounting the city scene. */
@ccclass('Bootstrap')
export class Bootstrap extends Component {
    protected start(): void {
        void this.openInitialCity().catch(loadError => {
            error('Unable to start the initial city:', loadError);
            if (this.isValid) this.showLoadError();
        });
    }

    private async openInitialCity(): Promise<void> {
        const loader = await CityContentLoader.create();
        const cityId = loader.catalog.initialCityId;
        if (!cityId) throw new Error('City catalog has no initial city');
        const initial = await loader.load(cityId);
        if (!this.isValid) { initial.release(); return; }

        await new Promise<void>((resolve, reject) => {
            const started = director.loadScene('city', (loadError, scene) => {
                if (loadError || !scene) {
                    reject(new Error(`Unable to open the city scene: ${String(loadError ?? 'empty scene')}`));
                    return;
                }
                const canvas = scene.getChildByName('Canvas');
                if (!canvas) {
                    reject(new Error('The city scene has no Canvas node'));
                    return;
                }
                try {
                    canvas.addComponent(CityManager).initialize(loader, initial);
                    resolve();
                } catch (mountError) {
                    reject(mountError);
                }
            });
            if (!started) reject(new Error('City scene loading did not start'));
        }).catch(sceneError => { initial.release(); throw sceneError; });
    }

    private showLoadError(): void {
        const message = new Node('CityLoadError');
        this.node.addChild(message);
        message.addComponent(UITransform).setContentSize(800, 180);
        const label = message.addComponent(Label);
        label.string = '城市加载失败，请重新进入游戏';
        label.fontSize = 40;
        label.lineHeight = 48;
        label.color = new Color(100, 60, 52, 255);
    }
}
