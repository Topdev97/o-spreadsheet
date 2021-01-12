import * as owl from "@odoo/owl";
import { createEmptyWorkbookData, load } from "./data";
import { LocalHistory } from "./history/local_history";
import {
  CommandDispatcher,
  CommandHandler,
  Getters,
  Command,
  WorkbookData,
  GridRenderingContext,
  LAYERS,
  CommandSuccess,
  EvalContext,
  isCoreCommand,
  CommandResult,
  Client,
  ClientPosition,
  CoreCommand,
  UID,
} from "./types/index";
import { _lt } from "./translation";
import { DEBUG, setIsFastStrategy, uuidv4 } from "./helpers/index";
import { corePluginRegistry, uiPluginRegistry } from "./plugins/index";
import { UIPlugin, UIPluginConstuctor } from "./plugins/ui_plugin";
import { CorePlugin, CorePluginConstructor } from "./plugins/core_plugin";
import { Session } from "./collaborative/session";
import { DEFAULT_REVISION_ID } from "./constants";
import { StateUpdateMessage, TransportService } from "./types/collaborative/transport_service";
import { LocalTransportService } from "./collaborative/local_transport_service";

import { StateObserver } from "./state_observer";
import { buildRevisionLog } from "./history/factory";

/**
 * Model
 *
 * The Model class is the owner of the state of the Spreadsheet. However, it
 * has more a coordination role: it defers the actual state manipulation work to
 * plugins.
 *
 * At creation, the Model instantiates all necessary plugins.  They each have
 * a private state (for example, the Selection plugin has the current selection).
 *
 * State changes are then performed through commands.  Commands are dispatched
 * to the model, which will then relay them to each plugins (and the history
 * handler). Then, the model will trigger an 'update' event to notify whoever
 * is concerned that the command was applied (if it was not cancelled).
 *
 * Also, the model has an unconventional responsibility: it actually renders the
 * visible viewport on a canvas. This is because each plugins actually manage a
 * specific concern about the content of the spreadsheet, and it is more natural
 * if they are able to read data from their internal state to represent it on the
 * screen.
 *
 * Note that the Model can be used in a standalone way to manipulate
 * programmatically a spreadsheet.
 */

export type Mode = "normal" | "headless" | "readonly";
export interface ModelConfig {
  mode: Mode;
  openSidePanel: (panel: string, panelProps?: any) => void;
  notifyUser: (content: string) => any;
  askConfirmation: (content: string, confirm: () => any, cancel?: () => any) => any;
  editText: (title: string, placeholder: string, callback: (text: string | null) => any) => any;
  evalContext: EvalContext;
  moveClient: (position: ClientPosition) => void;
  transportService: TransportService;
  client: Client;
}

const enum Status {
  Ready,
  Running,
  RunningCore,
  Finalizing,
  Interactive,
}

export class Model extends owl.core.EventBus implements CommandDispatcher {
  private corePlugins: CorePlugin[] = [];

  private uiPlugins: UIPlugin[] = [];

  private history: LocalHistory;

  private session: Session;

  /**
   * A plugin can draw some contents on the canvas. But even better: it can do
   * so multiple times.  The order of the render calls will determine a list of
   * "layers" (i.e., earlier calls will be obviously drawn below later calls).
   * This list simply keeps the renderers+layer information so the drawing code
   * can just iterate on it
   */
  private renderers: [UIPlugin, LAYERS][] = [];

  /**
   * Internal status of the model. Important for command handling coordination
   */
  private status: Status = Status.Ready;

  /**
   * The config object contains some configuration flag and callbacks
   */
  private config: ModelConfig;

  private state: StateObserver;
  /**
   * Getters are the main way the rest of the UI read data from the model. Also,
   * it is shared between all plugins, so they can also communicate with each
   * other.
   */
  getters: Getters;

  constructor(
    data: any = {},
    config: Partial<ModelConfig> = {},
    stateUpdateMessages: StateUpdateMessage[] = []
  ) {
    super();
    DEBUG.model = this;

    const workbookData = load(data);

    this.state = new StateObserver();

    this.config = this.setupConfig(config);

    this.session = this.setupSession(workbookData.revisionId);

    this.config.moveClient = this.session.move.bind(this.session);

    this.history = new LocalHistory(this.dispatchCore, this.session);

    // This should be done after construction of LocalHistory due to order of
    // events
    this.setupSessionEvents();

    this.getters = {
      canUndo: this.history.canUndo.bind(this.history),
      canRedo: this.history.canRedo.bind(this.history),
      getClient: this.session.getClient.bind(this.session),
      getConnectedClients: this.session.getConnectedClients.bind(this.session),
      // getRevisionLogs: this.history.getRevisionLogs.bind(this.history),
    } as Getters;

    setIsFastStrategy(true);
    // registering plugins
    for (let Plugin of corePluginRegistry.getAll()) {
      this.setupCorePlugin(Plugin, workbookData);
    }

    for (let Plugin of uiPluginRegistry.getAll()) {
      this.setupUiPlugin(Plugin);
    }
    setIsFastStrategy(false);
    // starting plugins
    this.dispatch("START");

    // Load the initial revisions
    this.session.catchUpMessages(stateUpdateMessages);
  }

  get handlers(): CommandHandler<Command>[] {
    return [...this.corePlugins, ...this.uiPlugins];
  }

  leaveSession() {
    this.session.leave();
  }

  destroy() {
    delete DEBUG.model;
  }

  private setupUiPlugin(Plugin: UIPluginConstuctor) {
    const dispatch = this.dispatch.bind(this);
    if (Plugin.modes.includes(this.config.mode)) {
      const plugin = new Plugin(this.getters, this.state, dispatch, this.config);
      for (let name of Plugin.getters) {
        if (!(name in plugin)) {
          throw new Error(_lt(`Invalid getter name: ${name} for plugin ${plugin.constructor}`));
        }
        this.getters[name] = plugin[name].bind(plugin);
      }
      this.uiPlugins.push(plugin);
      const layers = Plugin.layers.map((l) => [plugin, l] as [UIPlugin, LAYERS]);
      this.renderers.push(...layers);
      this.renderers.sort((p1, p2) => p1[1] - p2[1]);
    }
  }

  /**
   * Initialise and properly configure a plugin.
   *
   * This method is private for now, but if the need arise, there is no deep
   * reason why the model could not add dynamically a plugin while it is running.
   */
  private setupCorePlugin(Plugin: CorePluginConstructor, data: WorkbookData) {
    const dispatch = this.dispatchCore.bind(this);

    if (Plugin.modes.includes(this.config.mode)) {
      const plugin = new Plugin(this.getters, this.state, dispatch, this.config);
      plugin.import(data);
      for (let name of Plugin.getters) {
        if (!(name in plugin)) {
          throw new Error(_lt(`Invalid getter name: ${name} for plugin ${plugin.constructor}`));
        }
        this.getters[name] = plugin[name].bind(plugin);
      }
      this.corePlugins.push(plugin);
    }
  }

  private onRemoteRevisionReceived({ commands }: { commands: CoreCommand[] }) {
    for (let command of commands) {
      this.dispatchToHandlers(this.uiPlugins, command);
    }
    this.finalize();
  }

  private setupSession(revisionId: UID): Session {
    const session = new Session(
      buildRevisionLog(
        revisionId,
        this.state.recordChanges.bind(this.state),
        (command: CoreCommand) => this.dispatchToHandlers(this.corePlugins, command)
      ),
      this.config.transportService,
      this.config.client,
      revisionId
    );
    return session;
  }

  private setupSessionEvents() {
    this.session.on("remote-revision-received", this, this.onRemoteRevisionReceived);
    this.session.on("revision-redone", this, this.finalize);
    this.session.on("revision-undone", this, this.finalize);
    this.session.on("unexpected-revision-id", this, () =>
      this.config.notifyUser(_lt("Connection lost. Please reload the document."))
    );
    this.session.on("collaborative-event-received", this, () => {
      this.trigger("update");
    });
  }

  private setupConfig(config: Partial<ModelConfig>): ModelConfig {
    const client = config.client || { id: uuidv4(), name: _lt("Anonymous").toString() };
    const transportService = config.transportService || new LocalTransportService();
    return {
      mode: config.mode || "normal",
      openSidePanel: config.openSidePanel || (() => {}),
      notifyUser: config.notifyUser || (() => {}),
      askConfirmation: config.askConfirmation || (() => {}),
      editText: config.editText || (() => {}),
      evalContext: config.evalContext || {},
      transportService,
      client,
      moveClient: () => {},
    };
  }

  // ---------------------------------------------------------------------------
  // Command Handling
  // ---------------------------------------------------------------------------

  private checkDispatchAllowed(cmd: Command): CommandResult | undefined {
    for (let handler of [this.history, ...this.handlers]) {
      const allowDispatch = handler.allowDispatch(cmd);
      if (allowDispatch.status === "CANCELLED") {
        return allowDispatch;
      }
    }
    return undefined;
  }

  private finalize() {
    this.status = Status.Finalizing;
    for (const h of this.handlers) {
      h.finalize();
    }
    this.status = Status.Ready;
  }

  /**
   * The dispatch method is the only entry point to manipulate date in the model.
   * This is through this method that commands are dispatched, most of the time
   * recursively until no plugin want to react anymore.
   *
   * Small technical detail: it is defined as an arrow function.  There are two
   * reasons for this:
   * 1. this means that the dispatch method can be "detached" from the model,
   *    which is done when it is put in the environment (see the Spreadsheet
   *    component)
   * 2. This allows us to define its type by using the interface CommandDispatcher
   */
  dispatch: CommandDispatcher["dispatch"] = (type: string, payload?: any) => {
    const command: Command = { type, ...payload };
    let status: Status = command.interactive ? Status.Interactive : this.status;
    switch (status) {
      case Status.Ready:
        const error = this.checkDispatchAllowed(command);
        if (error) {
          return error;
        }
        this.status = Status.Running;
        const { changes, commands } = this.state.recordChanges(() => {
          if (isCoreCommand(command)) {
            this.state.addCommand(command);
          }
          this.dispatchToHandlers(this.handlers, command);
          this.finalize();
        });
        this.session.save(commands, changes);
        this.status = Status.Ready;
        if (this.config.mode !== "headless") {
          this.trigger("update");
        }
        break;
      case Status.Running:
      case Status.Interactive:
        if (isCoreCommand(command)) {
          this.state.addCommand(command);
        }
        this.dispatchToHandlers(this.handlers, command);
        break;
      case Status.Finalizing:
        throw new Error(_lt("Cannot dispatch commands in the finalize state"));
      case Status.RunningCore:
        throw new Error("A UI plugin cannot dispatch while handling a core command");
    }
    return { status: "SUCCESS" } as CommandSuccess;
  };

  private dispatchCore: CommandDispatcher["dispatch"] = (type: string, payload?: any) => {
    const command: Command = { type, ...payload };
    const previousStatus = this.status;
    this.status = Status.RunningCore;
    this.dispatchToHandlers(this.handlers, command);
    this.status = previousStatus;
    return { status: "SUCCESS" } as CommandSuccess;
  };

  private dispatchToHandlers(handlers: CommandHandler<Command>[], command: Command) {
    for (const handler of handlers) {
      handler.beforeHandle(command);
    }
    for (const handler of handlers) {
      handler.handle(command);
    }
  }

  // ---------------------------------------------------------------------------
  // Grid Rendering
  // ---------------------------------------------------------------------------

  /**
   * When the Grid component is ready (= mounted), it has a reference to its
   * canvas and need to draw the grid on it.  This is then done by calling this
   * method, which will dispatch the call to all registered plugins.
   *
   * Note that nothing prevent multiple grid components from calling this method
   * each, or one grid component calling it multiple times with a different
   * context. This is probably the way we should do if we want to be able to
   * freeze a part of the grid (so, we would need to render different zones)
   */
  drawGrid(context: GridRenderingContext) {
    // we make sure here that the viewport is properly positioned: the offsets
    // correspond exactly to a cell
    context.viewport = this.getters.snapViewportToCell(context.viewport);
    for (let [renderer, layer] of this.renderers) {
      context.ctx.save();
      renderer.drawGrid(context, layer);
      context.ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Data Export
  // ---------------------------------------------------------------------------

  /**
   * As the name of this method strongly implies, it is useful when we need to
   * export date out of the model.
   */
  exportData(): WorkbookData {
    if (!this.session.isFullySynchronized()) {
      throw new Error("Cannot export right now: the session is not fully synchronized");
    }
    let data = createEmptyWorkbookData();
    for (let handler of this.handlers) {
      if (handler instanceof CorePlugin) {
        handler.export(data);
      }
    }
    data.revisionId = this.session.getRevisionId() || DEFAULT_REVISION_ID;
    data = JSON.parse(JSON.stringify(data));
    return data;
  }
}
