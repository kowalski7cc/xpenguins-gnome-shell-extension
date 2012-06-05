const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta    = imports.gi.Meta;
const Shell   = imports.gi.Shell;

// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const Region = Me.region;
const XPUtil = Me.util;

/* Handy */
const WINDOW_COLOR = new Clutter.Color({blue: 255, red: 255, green: 255, alpha: 100});
const BORDER_WIDTH = 1; /* desired border width *after* scaling */
const SCALE = 0.2;
const UNSCALED_BORDER_WIDTH = Math.round(BORDER_WIDTH / SCALE);
/*
 * An object that tests the firing/connecting of all the signals.
 * For debugging.
 * Not to be included in the final extension.
 */
const XPenguins = {
    RECALC: {
        ALWAYS: 0,
        PAUSE : 1,
        END   : 2
    }
};

/* for dev mode only (so I can develop on all my computers easily,
 * one with 3.2 & one with 3.4). Default returns a whitelist.
 * This function doesn't require an instance.
 */
function getCompatibleOptions(blacklist) {
    /* enable everything by default */
    let defOpts = WindowListener.prototype.options,
        list = {};
    for (let opt in defOpts) {
        if (defOpts.hasOwnProperty(opt)) {
            list[opt] = !blacklist;
        }
    }

    /* disable windowed mode, not working yet */
    list.onDesktop = blacklist || false;

    /* recalcMode needs grab-op-begin and grab-op-end for global.display,
     * not in GNOME 3.2 */
    list.recalcMode = !(GObject.signal_lookup('grab-op-begin', GObject.type_from_name('MetaDisplay')));
    if (!blacklist) list.recalcMode = !list.recalcMode;
    return list;
}


function WindowListener() {
    this._init.apply(this, arguments);
}

WindowListener.prototype = {
    /* a bit silly but I want to access these externally without having to 
     * create an instance of it first */
    options: {
        ignorePopups: false,
        recalcMode: XPenguins.RECALC.ALWAYS,
        onDesktop: true,
        onAllWorkspaces: false
    },

    _init: function (i_options) {
         /*
          * Everyone:
          * RESTACKING: either notify::focus-app OR {for each win: "raised"}
          * NEW WINDOWS/DESTROYED WINDOWS:
          *   IGNORE POPUPS: window-added and window-removed    for dirtying toon windows
          *  !IGNORE POPUPS: mapped       and destroyed         for dirtying toon windows
          * WINDOW STATE:
          *  RECALC.PAUSE:  grab-op-{begin, end} (will miss keyboard-resizes)
          *                 maximize
          *                 unmaximize
          *                 minimize
          *  RECALC.ALWAYS: {for each winActor: allocation-changed}
          * UNMINIMISE:
          *   IGNORE POPUPS: nothing <hope for focus-app. Otherwise, can try winActor:show or window:notify::minimized>
          *  !IGNORE POPUPS: nothing <mapped>
          *
          * Anything with {foreach win} or {foreach winActor} needs to listen to window-added and workspace-switched.
          */

        /* dummy stuff for XPenguinsLoop compatibility */
        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && this.options.hasOwnProperty(opt)) {
                this.options[opt] = i_options[opt];
            } else {
                XPUtil.LOG('  option %s not supported yet', opt);
            }
        }

        this._playing = false;
        this._resumeSignal = {}; /* when you pause you have to listen for an event to unpause; use this._resumeID to store this. */
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */

        this._XPenguinsWindow = global.stage;
        let tmp = this.options.onAllWorkspaces;
        this.options.onAllWorkspaces = null;
        this.changeOption('onAllWorkspaces', tmp);
    },

    //// Public methods ////

    /* add other initialisation code here,
     * stuff that has to get reset whenever the timeline restarts.
     */
    init: function () {
        XPUtil.DEBUG('[WL] init');
        this._connectSignals();
        this._initDrawing();
        this._drawingArea.show();
        this._updateToonWindows();
        this._draw();
    },

    _cleanUp: function () {
        XPUtil.DEBUG('[WL] _cleanUp');

        this._playing = false;

        /* disconnect events */
        this._disconnectSignals();

        if (this._drawingArea) {
            global.stage.remove_actor(this._drawingArea);
            this._drawingArea.destroy();
        }
    },


    destroy: function () {
        this._cleanUp();
    },

    /* start the main xpenguins loop: main.c
     * init() should have been called by now.
     */
    start: function () {
        XPUtil.DEBUG('[WL] start');
        this.init();
        this._playing = true;
    },

    exit: function () {
        this._cleanUp();
    },

    stop: function () {
        XPUtil.DEBUG('[WL] stop');
        this._drawingArea.hide();
        this._playing = false;
        this.exit();
    },

    /* pauses the timeline & temporarily stops listening for events,
     * *except* for owner.connect(eventName) which sends the resume signal.
     */
    pause: function (hide, owner, eventName, cb) {
        XPUtil.DEBUG('[WL] pause');
        this._playing = false;

        /* recalculate toon windows on resume */
        this._dirtyToonWindows('pause');
        /* temporarily disconnect events */
        this._disconnectSignals();

        /* hide drawing area? */
        if (hide && this._drawingArea) {
            this._drawingArea.hide();
        }

        /* connect up the signal to resume */
        if (owner) {
            this._connectAndTrack(this._resumeSignal, owner, eventName, 
                Lang.bind(this, function () {
                    if (!cb || cb.apply(this, arguments)) {
                        this._disconnectTrackedSignals(this._resumeSignal);
                        this.resume();
                    }
                }));
        }
    },

    /* resumes timeline, connects up events */
    resume: function () {
        XPUtil.DEBUG('[WL] resume');
        this._playing = true;

        if (this._drawingArea && !this._drawingArea.visible) {
            this._drawingArea.show();
        }
        /* reconnect events */
        this._connectSignals();
        /* recalculate toon windows */
        this._dirtyToonWindows('resume');
    },

    /* see whether timeline is playing */
    is_playing: function () {
        return this._playing;
    },

    /* called when configuration is changed.
     */
    changeOption: function (propName, propVal) {
        if (!this.options.hasOwnProperty(propName) || this.options[propName] === propVal) {
            return;
        }

        XPUtil.DEBUG('changeOption[WL]: %s = %s', propName, propVal);
        this.options[propName] = propVal;

        // ARGH compatibility issues....
        if (propName === 'onAllWorkspaces') {
            if (this._XPenguinsWindow instanceof Meta.WindowActor) {
                this._XPenguinsWindow.get_workspace = this._XPenguinsWindow.meta_window.get_workspace;
            } else {
                /* just to initially connect the window's workspace to listen
                 * to window-added & window-removed events
                 */
                if (this.options.onAllWorkspaces) {
                    // always return "current" workspace.
                    this._XPenguinsWindow.get_workspace = Lang.bind(global.screen, global.screen.get_active_workspace);
                } else {
                    // return the starting workspace.
                    let ws = global.screen.get_active_workspace();
                    this._XPenguinsWindow.get_workspace = function () { return ws; };
                }
            }
        }

        if (this._playing) {
            this._updateSignals();
        }
    },

    //// Private methods ////

    _updateSignals: function () {
        this._disconnectSignals();
        this._connectSignals();
    },


    _connectSignals: function () {
        XPUtil.DEBUG('[WL] connectSignals');
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */
        let ws = this._XPenguinsWindow.get_workspace();

        /* new or destroyed windows */
        if (this.options.ignorePopups) {
            /* Listen to 'window-added' and '-removed': these are the only windows that count. */
            this._connectAndTrack(this, ws, 'window-added', Lang.bind(this, function () { this._dirtyToonWindows('window-added'); }));
            this._connectAndTrack(this, ws, 'window-removed', Lang.bind(this, function () { this._dirtyToonWindows('window-removed'); }));
        } else {
            /* Listen to 'mapped' and 'destroyed': every window here counts */
            this._connectAndTrack(this, global.window_manager, 'map', Lang.bind(this, function () { this._dirtyToonWindows('map'); }));
            this._connectAndTrack(this, global.window_manager, 'destroy', Lang.bind(this, function () { this._dirtyToonWindows('destroy'); }));
        }


        /* resizing/moving */
        if (this.options.recalcMode === XPenguins.RECALC.ALWAYS) {
            // done in _onWindowAdded.
            this._listeningPerWindow = true;
        } else {
            /* if RECALC.PAUSE, pause on grab-op-begin with resume hook on grabOpEnd.
             * Otherwise, just recalc on grab-op-end.
             */
            if (this.options.recalcMode === XPenguins.RECALC.PAUSE) {
                this._connectAndTrack(this, global.display, 'grab-op-begin',
                    Lang.bind(this, function () {
                        this.pause(false, global.display, 'grab-op-end');
                    }));
            } else {
                this._connectAndTrack(this, global.display, 'grab-op-end',
                    Lang.bind(this, function () {
                        this._dirtyToonWindows('grab-op-end');
                    }));
            }
        }

        /* maximize, unmaximize */
        if (this.options.recalcMode !== XPenguins.RECALC.ALWAYS) {
            this._connectAndTrack(this, global.window_manager, 'maximize', Lang.bind(this, function () { this._dirtyToonWindows('maximize'); }));
            this._connectAndTrack(this, global.window_manager, 'unmaximize', Lang.bind(this, function () { this._dirtyToonWindows('unmaximize'); }));
        }   /* Otherwise allocation-changed covers all of the above. */

        /* minimize/unminimize */
        if (this.options.ignorePopups) {
            /* can either listen to notify::focus-app, or notify::minimize.
             * Done in _onWindowAdded. */
            this._listeningPerWindow = true;
        } else {
            /* Otherwise 'map' covers unminimize */
            if (this.options.recalcMode !== XPenguins.RECALC.ALWAYS) {
                this._connectAndTrack(this, global.window_manager, 'minimize', Lang.bind(this, function () { this._dirtyToonWindows('minimize'); }));
            } /* Otherwise 'allocation-changed' covers minimize. */
        }

        /* stacking order: NOTE: this *only* matters if we are not running on the desktop, or
         * if we are ignoring maximised windows (& windows underneath them) - must remember them when
         * they become visible.
         * Just listen to notify::raise on all windows (notify::focus-app fires twice).
         */
        if (!this.options.onDesktop || this.options.ignoreMaximised) {
            this._listeningPerWindow = true;
            /* done in _onWindowAdded */
        }

        /*** if listening to any events from each window, we need to listen to window-added and window-removed
             in order to add the appropriate listeners.
             Then, we also need to listen to workspace-changed to reconnect these signals.
         ***/
        if (this._listeningPerWindow) {
            this._connectAndTrack(this, ws, 'window-added', Lang.bind(this, this._onWindowAdded));
            this._connectAndTrack(this, ws, 'window-removed', Lang.bind(this, this._onWindowRemoved));

            this._connectAndTrack(this, global.window_manager, 'switch-workspace', Lang.bind(this, this._onWorkspaceChanged));
            /* connect up existing windows */
            ws.list_windows().map(Lang.bind(this, function (metaWin) {
                if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                    this._onWindowAdded(null, metaWin);
                }
            }));
        }
    },

    _disconnectSignals: function () {
        XPUtil.DEBUG('disconnectSignals');
        /* disconnect all signals */
        this._disconnectTrackedSignals(this);

        let ws = this._XPenguinsWindow.get_workspace();
        ws.list_windows().map(Lang.bind(this, function (metaWin) {
            if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                this._onWindowRemoved(null, metaWin);
            }
        }));
        this._listeningPerWindow = false;

        /* Should I do this? Or just in the 'terminate' signal? */
        /* Just have to make sure you connect it up *after* calling pause. */
        this._disconnectTrackedSignals(this._resumeSignal);
    },

    /***********
     * SIGNALS *
     ***********/

    /* Note: for now, per-window signals are *all* stored in the relevant actor. */
    _onWindowAdded: function (workspace, metaWin) {
        XPUtil.DEBUG('_onWindowAdded for %s', metaWin.get_title());
        let winActor = metaWin.get_compositor_private();
        if (!winActor) {
            /* Newly-created windows are added to a workspace before
             * the compositor finds out about them. */
            Mainloop.idle_add(Lang.bind(this, function () {
                if (metaWin.get_workspace() === workspace) {
                    this._onWindowAdded(workspace, metaWin);
                }
                return false;
            }));
            return;
        }

        /* minimize/unminimize: notify::minimize */
        if (this.options.ignorePopups) {
            this._connectAndTrack(winActor, metaWin, 'notify::minimized',
                Lang.bind(this, function () {
                    this._dirtyToonWindows('notify::minimized');
                }));
        }

        /* Stacking order. If we're not running on the desktop, then listen to 'raised' */
        if (!this.options.Desktop || this.options.ignoreMaximised) {
            this._connectAndTrack(winActor, metaWin, 'raised', Lang.bind(this, function () {
                this._dirtyToonWindows('raised');
            }));
        }

        /* resized/moved windows */
        if (this.options.recalcMode === XPenguins.RECALC.ALWAYS) {
            this._connectAndTrack(winActor, winActor, 'allocation-changed', Lang.bind(this, function () {
                this._dirtyToonWindows('allocation-changed');
            }));
        }
    },

    _onWindowRemoved: function (workspace, metaWin) {
        /* disconnect all the signals */
        XPUtil.DEBUG('_onWindowRemoved for %s', metaWin.get_title());
        this._disconnectTrackedSignals(metaWin.get_compositor_private());
    },

    /* Remove the window-added/removed listeners from the old workspace:
     * - add them to the current one (if onAllWorkspaces)
     * - resume (if switched to XPenguinWindow's workspace)
     * - pause (if switched away from XPenguinWindow's workspace)
     * and add them to the current one
     */
    _onWorkspaceChanged: function (shellwm, fromI, toI, direction) {
        // from & to are indices.
        XPUtil.DEBUG('_onWorkspaceChanged: from %d to %d', fromI, toI);
        /* If you've changed workspaces, you need to change window-added/removed listeners. */
        if (this.options.onAllWorkspaces) {
            /* update the toon region */
            // Note: if you call this straight away and switch back into a workspace *with* windows, it doesn't update until the next event.
            // However, if you're running a timeline it'll be fine.
            Mainloop.idle_add(Lang.bind(this, function () {
                this._dirtyToonWindows('_onWorkspaceChanged');
                return false;
            }));

            /* disconnect/reconnect window-added & window-removed events we were listening to */
            if (this._listeningPerWindow) {
                let from = global.screen.get_workspace_by_index(fromI),
                    to = global.screen.get_workspace_by_index(toI);
                this._disconnectTrackedSignals(from);

                this._connectAndTrack(this, to, 'window-added', Lang.bind(this, this._onWindowAdded));
                this._connectAndTrack(this, to, 'window-removed', Lang.bind(this, this._onWindowRemoved));

                /* connect up existing windows */
                to.list_windows().map(Lang.bind(this, function (metaWin) {
                    if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                        this._onWindowAdded(null, metaWin);
                    }
                }));
            }
        } else {
            /* hide the toons & pause if we've switched to another workspace */
            if (global.screen.get_workspace_by_index(toI) !==
                    this._XPenguinsWindow.get_workspace()) {
                this.pause(true, global.window_manager, 'switch-workspace',
                    /* Note: binding done on pause end. do it here too for safety? */
                    function (dmy, fI, tI, dir) {
                        return (global.screen.get_workspace_by_index(tI) === 
                            this._XPenguinsWindow.get_workspace());
                    });
            } else {
                this.resume();
            }
        }
    },

    /*********************
     *     FUNCTION      *
     *********************/
    _dirtyToonWindows: function (msg) {
        // hmm, in debugging mode I'd also like to track why.
        XPUtil.DEBUG('_dirtyToonWindows %s', msg);
        /* do the following in the timeline for XPenguins */
        this._updateToonWindows();
        this._draw();
    },

    _updateToonWindows: function () {
        XPUtil.DEBUG('[WL] updateToonWindows');
        this._toonWindows.clear();
        /* Add windows to region. If we use list_windows() we wont' get popups,
         * if we use get_window_actors() we will. */
        let winList,
            ws = this._XPenguinsWindow.get_workspace();
        if (this.options.ignorePopups) {
            winList = ws.list_windows();
        } else {
            // already sorted.
            winList = global.get_window_actors().map(function (act) { return act.meta_window; });
            /* filter out other workspaces */
            winList = winList.filter(function (win) { return win.get_workspace() === ws; });
        }

        /* sort by stacking (if !onDesktop or ignoreMaximised).
         * Supposedly global.get_window_actors() is already sorted by stacking order
         * but sometimes it needs a Mainloop.idle_add before it works properly.
         * If I resort them it all seems to go fine.
         */
        if (!this.options.onDesktop || this.options.ignoreMaximised) {
            winList = global.display.sort_windows_by_stacking(winList);
        }

        /* iterate through backwards: every window up to winList[i] == winActor has a chance
         * of being on top of you. Once you hit winList[i] == winActor, the other windows
         * are *guaranteed* to be behind you.
         */
        /* filter out desktop & nonvisible/mapped windows windows */
        winList = winList.filter(Lang.bind(this, function (win) {
            return (win.get_compositor_private().mapped &&
                    win.get_compositor_private().visible &&
                    win.get_window_type() !== Meta.WindowType.DESKTOP);
        }));

        let i = winList.length;
        while (i--) {
            /* exit once you hit the window actor (if !onDesktop),
             * or once you hit a maximised window (if ignoreMaximised) 
             */ 
            if ((!this.options.onDesktop && winList[i] === this._XPenguinsWindow.meta_window) ||
                    (this.options.ignoreMaximised && winList[i].get_maximized() ===
                        (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL))) {
                break;
            }
            let rect = winList[i].get_outer_rect();
            rect.wid = winList[i].get_stable_sequence(); /* "Unique integer assigned to each MetaWindow on creation" */
            this._toonWindows.addRectangle(rect);
        }
    }, // _updateToonWindows


    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    _connectAndTrack: function (owner, subject, name, cb) {
        XPUtil.DEBUG('_connectAndTrack for %s', owner.toString());
        if (!owner.hasOwnProperty('_XPenguins_bound_signals')) {
            owner._XPenguins_bound_signals = [];
        }
        owner._XPenguins_bound_signals.push([subject, subject.connect(name, cb)]);
    },

    _disconnectTrackedSignals: function (owner) {
        if (!owner) { return; }
        XPUtil.DEBUG('_disconnectTrackedSignals for %s', owner.toString());
        if (!owner._XPenguins_bound_signals) { return; }
        owner._XPenguins_bound_signals.map(
            function (sig) {
                sig[0].disconnect(sig[1]);
                //XPUtil.DEBUG(' .. disconnecting signal ID %d from object %s',
                //     i, sig[0].toString());
            }
        );
        delete owner._XPenguins_bound_signals;
    },

    /*********************
     *      DRAWING      *
     *********************/
    _initDrawing: function () {
        /* set up drawing area & add to stage */
        this._drawingArea = new Clutter.Group({
            width: this._XPenguinsWindow.get_width(),
            height: this._XPenguinsWindow.get_height(),
            x: 5,
            y: 5
        });
        this._drawingArea.set_scale(SCALE, SCALE);

        global.stage.add_actor(this._drawingArea);
        this._drawingArea.hide();

        /* set up toonwindows */
        this._toonWindows = new Region.Region();
    },

    _draw: function () {
        this._drawingArea.remove_all();

        // Background..
        let bg = 
        this._drawingArea.add_actor(
            new Clutter.Rectangle({ 
                width: this._drawingArea.width,
                height: this._drawingArea.height,
                color: Clutter.Color.get_static(Clutter.StaticColor.BLACK),
                border_color: Clutter.Color.get_static(Clutter.StaticColor.RED),
                border_width: UNSCALED_BORDER_WIDTH
            }));

        XPUtil.DEBUG('draw: %d windows', this._toonWindows.rectangles.length);
        // windows
        for (let i = 0; i < this._toonWindows.rectangles.length; ++i) {
            let rect = 
            this._drawingArea.add_actor(
                new Clutter.Rectangle({ 
                    width: this._toonWindows.rectangles[i].width,
                    height: this._toonWindows.rectangles[i].height,
                    x: this._toonWindows.rectangles[i].x,
                    y: this._toonWindows.rectangles[i].y,
                    color: WINDOW_COLOR,
                    border_color: Clutter.Color.get_static(Clutter.StaticColor.YELLOW),
                    border_width: UNSCALED_BORDER_WIDTH 
                }));
        }
    }
};
