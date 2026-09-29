import { _decorator, Component, director, Director, Node, UITransform, warn } from 'cc';
import type { CityContentLoader, LoadedCity } from '../config/CityContentLoader';
import { MapBrowserDemo } from '../map/MapBrowserDemo';
import { CityCompletionPanel } from '../ui/CityCompletionPanel';

const { ccclass } = _decorator;
interface CityInstance { content: LoadedCity; root: Node; view: MapBrowserDemo }

/** Coordinates a transactional city replacement and the player's completion choices. */
@ccclass('CityManager')
export class CityManager extends Component {
    private loader: CityContentLoader | null = null;
    private current: CityInstance | null = null;
    private ui: CityCompletionPanel | null = null;
    private completionShown = false;
    private loading = false;
    private failed = false;
    private generation = 0;
    private disposed = false;

    public initialize(loader: CityContentLoader, initial: LoadedCity): void {
        this.loader = loader;
        this.ui = new CityCompletionPanel(this.node, () => this.continueExploring(),
            () => { void this.goNext(); }, () => this.showCompletion());
        this.current = this.prepare(initial);
        this.current.root.active = true;
        this.ui.root.setSiblingIndex(this.node.children.length - 1);
        this.checkCompletion();
    }

    protected update(): void {
        if (this.current) this.resizeCity(this.current.root);
        this.ui?.resize();
    }

    public continueExploring(): void {
        if (!this.ui?.isOpen || !this.current) return;
        // In-flight requests cannot be cancelled by Cocos; invalidate their eventual results.
        this.generation++;
        this.loading = false;
        this.failed = false;
        this.current.view.cancelGestures();
        this.current.view.setHintsEnabled(true);
        this.ui.close();
    }

    public async goNext(): Promise<void> {
        const old = this.current;
        const nextId = old?.content.config.nextCityId;
        if (this.disposed || this.loading || !old || !nextId || !old.view.progress.allRequiredComplete || !this.loader) return;
        const request = ++this.generation;
        this.loading = true;
        this.failed = false;
        this.showCompletion();
        let loaded: LoadedCity | null = null;
        let staged: CityInstance | null = null;
        try {
            loaded = await this.loader.load(nextId);
            if (this.disposed || request !== this.generation) { loaded.release(); return; }
            // Build the next city while inactive. A mount failure leaves the old city intact.
            staged = this.prepare(loaded);
        } catch (loadError) {
            // prepare() owns cleanup once entered; a load failure cleans its own resources.
            if (this.disposed || request !== this.generation) return;
            this.loading = false;
            this.failed = true;
            warn('Unable to travel to the next city:', loadError);
            this.showCompletion();
            return;
        }
        this.current = staged;
        this.loading = false;
        this.failed = false;
        this.completionShown = false;
        this.retire(old);
        staged.root.active = true;
        this.ui?.reset();
        this.ui?.root.setSiblingIndex(this.node.children.length - 1);
        this.checkCompletion();
    }

    private prepare(content: LoadedCity): CityInstance {
        const root = new Node('CityContent');
        root.active = false;
        this.node.addChild(root);
        root.addComponent(UITransform);
        this.resizeCity(root);
        const view = root.addComponent(MapBrowserDemo);
        const instance = { content, root, view };
        try {
            view.mount(content.config, content.bundle, () => {
                if (this.current === instance) this.checkCompletion();
            }, (x, y) => this.loading || !!this.ui?.blocksInput(x, y));
            return instance;
        } catch (mountError) {
            this.retire(instance);
            throw mountError;
        }
    }

    private checkCompletion(): void {
        if (this.completionShown || !this.current?.view.progress.allRequiredComplete) return;
        this.completionShown = true;
        this.showCompletion();
    }

    private showCompletion(): void {
        const current = this.current;
        if (!current?.view.progress.allRequiredComplete) return;
        current.view.cancelGestures();
        current.view.setHintsEnabled(false);
        this.ui?.show({ cityName: current.content.config.cityName, hasNext: !!current.content.config.nextCityId,
            progress: current.view.progress, ...current.view.discoveries }, this.loading, this.failed);
    }

    private resizeCity(root: Node): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (size) root.getComponent(UITransform)!.setContentSize(size);
    }

    private retire(instance: CityInstance): void {
        if (instance.root.isValid) {
            instance.root.active = false;
            if (instance.view.isValid) instance.view.dispose();
            instance.root.destroy();
        }
        // Creator destroys nodes after update and before drawing; never release assets under live nodes.
        director.once(Director.EVENT_AFTER_DRAW, () => instance.content.release());
    }

    protected onDestroy(): void {
        this.disposed = true;
        this.generation++;
        if (this.current) this.retire(this.current);
        this.current = null;
        this.loader = null;
        this.ui?.dispose();
        this.ui = null;
    }
}
