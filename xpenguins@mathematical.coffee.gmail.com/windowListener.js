/*
 * This file contain the WindowListener class and the Region class.
 * The WindowListener class maintains an up-to-date Region of the current
 * windows. See the 'Window HUD' extension as an example of how to use it
 * (https://bitbucket.org/mathematicalcoffee/window-hud-gnome-shell-extension/)
 *
 * You are free to use this file in your extension but please include a mention
 * of where it came from :)
 *
 * Amy Chan 2012.
 * v1.0
 */
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta    = imports.gi.Meta;

/* When to recalculate window position/size changes.
 * In order of decreasing awesomeness (increasing efficiency):
 * ALWAYS: Always (even during the resize/move)
 * END   : Run while resize/move is in progress, recalculate at the end.
 *         (So toons could walk off-window).
 * PAUSE : Pause until resize/move has finished, then recalc at the end.
 */
const RECALC = {
    ALWAYS: 0,
    END   : 1,
    PAUSE : 2
};

/* The WindowListener class.
 *
 * All this class does is strive to maintain an up-to-date snapshot of the
 * windows currently on the screen.
 *
 * It stores this as a Region in this.windowRegion (see region.js).
 *
 * To use this class, subclass it. As an example, see the WindowHUD class
 * in extension.js which provides a graphical snapshot of this.windowRegion.
 *
 * Use this.start() to start listening to events, and this.stop() to stop.
 * Also available are pause, is_playing, and is_paused functions.
 *
 * Every time a window event is recorded that changes this.windowRegion, the
 * function _onWindowEvent is called. You will probably want to override
 * this function in your own class to do something when this happens (for
 * example in WindowHUD, update the picture being drawn).
 * It is recommended you call WindowListener's _onWindowEvent function within
 * your own _onWindowEvent function (this calls _updateWindows() which is what
 * actually updates this.windowRegion).
 */
function WindowListener() {
    this._init.apply(this, arguments);
}

WindowListener.prototype = {
    /* a bit silly but I want to access these externally without having to
     * create an instance of it first */
    options: {
        // do we include popup windows (tooltips, ...) in the display?
        ignorePopups: false,
        // do we update whenever stacking order changes (will not show
        // in the display)?
        stackingOrder: true,
        recalcMode: RECALC.ALWAYS,
        onAllWorkspaces: true,
        verbose: true
    },

    LOG: function () {
        if (this.options.verbose) {
            LOG.apply(this, arguments);
        }
    },

    _init: function (i_options) {
         /*
          * Everyone:
          * RESTACKING: {for each win: "raised"}
          * NEW WINDOWS/DESTROYED WINDOWS:
          *   IGNORE POPUPS: window-added and window-removed
          *  !IGNORE POPUPS: mapped       and destroyed
          * WINDOW STATE:
          *  RECALC.PAUSE:  grab-op-{begin, end} (will miss keyboard-resizes)
          *                 maximize
          *                 unmaximize
          *                 minimize
          *  RECALC.ALWAYS: {for each winActor: allocation-changed}
          * UNMINIMISE:
          *   IGNORE POPUPS: {for each win: notify::minimized}
          *  !IGNORE POPUPS: nothing <mapped>
          *
          * Anything with {foreach win} or {foreach winActor} needs to listen
          * to window-added and workspace-switched.
          */

        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && this.options.hasOwnProperty(opt)) {
                this.options[opt] = i_options[opt];
            } else {
                LOG('  option %s not supported yet', opt);
            }
        }

        this._playing = false;
        this._sleeping = false;
        /* when you pause you have to listen for an event to unpause;
         * use this._resumeID to store this. */
        this._resumeSignal = {};
        /* whether we have to listen to individual windows for signals */
        this._listeningPerWindow = false;
        this.windowRegion = new Region();
    },

    get_workspace: function () {
        if (this.options.onAllWorkspaces) {
            return global.screen.get_active_workspace();
        }
        return this._startingWorkspace;
    },

    //// Public methods ////
    /* see whether timeline is playing (returns TRUE if paused but playing) */
    is_playing: function () {
        return this._playing;
    },

    /* see whether the timeline is paused */
    is_paused: function () {
        return this._playing && this._sleeping;
    },

    /* Called to start listening to signals */
    start: function () {
        this.LOG('[WL] start');
        this._playing = true;
        this._sleeping = false;
        this._startingWorkspace = global.screen.get_active_workspace();
        this._connectSignals();
        this._onWindowEvent('start');
    },

    /* Called to stop listening to signals */
    stop: function () {
        this.LOG('[WL] stop');
        this._playing = false;
        this._sleeping = false;
        /* disconnect events */
        this._disconnectSignals();
        this.disconnectTrackedSignals(this._resumeSignal);
    },

    /* Called to temporarily stop listening for events, *except* for
     * owner.connect(eventName) which will resume the signal *if* the
     * specificed callback evaluates to TRUE.
     * Note - this.is_playing() will still return true if it's paused.
     */
    pause: function (owner, eventName, cb) {
        this.LOG('[WL] pause');

        /* temporarily disconnect events */
        this._disconnectSignals();

        this._sleeping = true;

        /* connect up the signal to resume */
        if (owner) {
            this.connectAndTrack(this._resumeSignal, owner, eventName,
                Lang.bind(this, function () {
                    if (!cb || cb.apply(this, arguments)) {
                        this.disconnectTrackedSignals(this._resumeSignal);
                        this.resume();
                    }
                }));
        }
    },

    /* Called to resume listening for events after a pause. */
    resume: function () {
        this.LOG('[WL] resume');
        /* reconnect events */
        this._connectSignals();
        /* recalculate toon windows */
        this._onWindowEvent('resume');
        this._sleeping = false;
    },

    /* Called when the listener is destroyed */
    destroy: function () {
        this.stop();
        delete this.windowRegion;
    },

    /* called when configuration is changed, handles on-the-fly changes. */
    changeOption: function (propName, propVal) {
        if (!this.options.hasOwnProperty(propName) ||
                this.options[propName] === propVal) {
            return;
        }

        this.LOG('changeOption[WL]: %s = %s', propName, propVal);
        this.options[propName] = propVal;

        /* extra stuff */
        if (propName === 'onAllWorkspaces' && !propVal) {
            this._startingWorkspace = global.screen.get_active_workspace();
        }

        if (this.is_playing()) {
            this._updateSignals();
        }
    },

    /* Utility functions
     * Note : my connect/disconnect tracker takes ideas from shellshape
     * extension: signals are stored by the owner, storing both the target &
     * the id to clean up later
     */

    /* calls subject.connect(name, cb) and stores the resulting ID in owner. */
    connectAndTrack: function (owner, subject, name, cb) {
        this.LOG('connectAndTrack for %s', owner.toString());
        if (!owner.hasOwnProperty('_WindowHUD_bound_signals')) {
            owner._WindowHUD_bound_signals = [];
        }
        owner._WindowHUD_bound_signals.push([subject, subject.connect(name, cb)]);
    },

    /* disconnects all signals that are being tracked by owner */
    disconnectTrackedSignals: function (owner) {
        if (!owner) { return; }
        this.LOG('disconnectTrackedSignals for %s', owner.toString());
        if (!owner._WindowHUD_bound_signals) { return; }
        owner._WindowHUD_bound_signals.map(
            function (sig) {
                sig[0].disconnect(sig[1]);
            }
        );
        delete owner._WindowHUD_bound_signals;
    },

    //// Methods you can override ////

    /* Every time a window event happens that changes the current window region,
     * this function is called. You can override it to add what you want to
     * happen here.
     * I recommend at least calling this._updateWindows() which refreshes the
     * current snapshot of the windows, this.windowRegion.
     */
    _onWindowEvent: function (msg) {
        this.LOG('[WL] _onWindowEvent: %s', msg || '');
        this._updateWindows();
    },


    //// Private methods ////

    /* updates this.windowRegion, the current snapshot of all the windows
     * on the screen */
    _updateWindows: function () {
        this.windowRegion.clear();
        /* Add windows to region. If we use list_windows() we wont' get popups,
         * if we use get_window_actors() we will. */
        let winList,
            ws = this.get_workspace();
        if (this.options.ignorePopups) {
            winList = ws.list_windows();
        } else {
            // already sorted.
            winList = global.get_window_actors().map(function (act) {
                return act.meta_window;
            });
            /* filter out other workspaces */
            winList = winList.filter(function (win) {
                return win.get_workspace() === ws;
            });
        }

        /* sort by stacking (bottom-most to top-most) */
        if (this.options.stackingOrder) {
            winList = global.display.sort_windows_by_stacking(winList);
        }

        /* filter out desktop & nonvisible/mapped windows windows */
        winList = winList.filter(Lang.bind(this, function (win) {
            return (win.get_compositor_private().mapped &&
                    win.get_compositor_private().visible &&
                    win.get_window_type() !== Meta.WindowType.DESKTOP);
        }));

        for (let i = 0; i < winList.length; ++i) {
            this.windowRegion.addRectangle(winList[i].get_outer_rect());
        }
    },

    /* refreshes signals after (say) an option change */
    _updateSignals: function () {
        this._disconnectSignals();
        this._connectSignals();
    },

    /* connects the window listener up to all signals of interest */
    _connectSignals: function () {
        this.LOG('[WL] _connectSignals');
        this._listeningPerWindow = false;
        let ws = this.get_workspace();

        /* new or destroyed windows */
        if (this.options.ignorePopups) {
            /* Listen to 'window-added' and 'window-removed' */
            this.connectAndTrack(this, ws, 'window-added',
                Lang.bind(this, function () {
                    this._onWindowEvent('window-added');
                }));
            this.connectAndTrack(this, ws, 'window-removed',
                Lang.bind(this, function () {
                    this._onWindowEvent('window-removed');
                }));
        } else {
            /* Listen to 'mapped' and 'destroyed': every window here counts */
            this.connectAndTrack(this, global.window_manager, 'map',
                Lang.bind(this, function () {
                    this._onWindowEvent('map');
                }));
            this.connectAndTrack(this, global.window_manager, 'destroy',
                Lang.bind(this, function () {
                    this._onWindowEvent('destroy');
                }));
        }


        /* resizing/moving */
        if (this.options.recalcMode === RECALC.ALWAYS) {
            // done in _onWindowAdded.
            this._listeningPerWindow = true;
        } else {
            /* if RECALC.PAUSE, pause on grab-op-begin with resume hook on grabOpEnd.
             * Otherwise, just recalc on grab-op-end.
             */
            if (this.options.recalcMode === RECALC.PAUSE) {
                this.connectAndTrack(this, global.display, 'grab-op-begin',
                    Lang.bind(this, function () {
                        this.pause(false, global.display, 'grab-op-end');
                    }));
            } else {
                this.connectAndTrack(this, global.display, 'grab-op-end',
                    Lang.bind(this, function () {
                        this._onWindowEvent('grab-op-end');
                    }));
            }
        }

        /* maximize, unmaximize */
        if (this.options.recalcMode !== RECALC.ALWAYS) {
            this.connectAndTrack(this, global.window_manager, 'maximize',
                Lang.bind(this, function () {
                    this._onWindowEvent('maximize');
                }));
            this.connectAndTrack(this, global.window_manager, 'unmaximize',
                Lang.bind(this, function () {
                    this._onWindowEvent('unmaximize');
                }));
        }   /* Otherwise allocation-changed covers all of the above. */

        /* minimize/unminimize */
        if (this.options.ignorePopups) {
            /* can either listen to notify::focus-app, or notify::minimize.
             * Done in _onWindowAdded. */
            this._listeningPerWindow = true;
        } else {
            /* Otherwise 'map' covers unminimize */
            if (this.options.recalcMode !== RECALC.ALWAYS) {
                this.connectAndTrack(this, global.window_manager, 'minimize',
                    Lang.bind(this, function () {
                        this._onWindowEvent('minimize');
                    }));
            } /* Otherwise 'allocation-changed' covers minimize. */
        }

        /* stacking order:
         * Just listen to notify::raise on all windows
         * (notify::focus-app fires twice so not that one.).
         */
        if (this.options.stackingOrder) {
            this._listeningPerWindow = true;
            /* done in _onWindowAdded */
        }

        /* if listening to any events from each window, we need to listen to
         * window-added and window-removed in order to add the appropriate
         * listeners. Then, we also need to listen to workspace-changed to
         * reconnect these signals.
         */
        if (this._listeningPerWindow) {
            this.connectAndTrack(this, ws, 'window-added',
                Lang.bind(this, this._onWindowAdded));
            this.connectAndTrack(this, ws, 'window-removed',
                Lang.bind(this, this._onWindowRemoved));

            this.connectAndTrack(this, global.window_manager,
                'switch-workspace', Lang.bind(this, this._onWorkspaceChanged));
            /* connect up existing windows */
            ws.list_windows().map(Lang.bind(this, function (metaWin) {
                if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                    this._onWindowAdded(null, metaWin);
                }
            }));
        }
    },

    /* Disconnects the window listener from the various signals */
    _disconnectSignals: function () {
        this.LOG('_disconnectSignals');
        /* disconnect all signals */
        this.disconnectTrackedSignals(this);

        let ws = this.get_workspace();
        ws.list_windows().map(Lang.bind(this, function (metaWin) {
            if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                this._onWindowRemoved(null, metaWin);
            }
        }));
        this._listeningPerWindow = false;

        /* Should I do this? Or just in the 'terminate' signal? */
        /* Just have to make sure you connect it up *after* calling pause. */
        this.disconnectTrackedSignals(this._resumeSignal);
    },


    /***********
     * SIGNALS *
     ***********/

    /* Note: for now, per-window signals are *all* stored in the relevant actor. */
    _onWindowAdded: function (workspace, metaWin) {
        this.LOG('_onWindowAdded for %s', metaWin.get_title());
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
            this.connectAndTrack(winActor, metaWin, 'notify::minimized',
                Lang.bind(this, function () {
                    this._onWindowEvent('notify::minimized');
                }));
        }

        /* Stacking order.
         * If we're not running on the desktop, then listen to 'raised' */
        if (this.options.stackingOrder) {
            this.connectAndTrack(winActor, metaWin, 'raised',
                Lang.bind(this, function () {
                    this._onWindowEvent('raised');
                }));
        }

        /* resized/moved windows */
        if (this.options.recalcMode === RECALC.ALWAYS) {
            this.connectAndTrack(winActor, winActor, 'allocation-changed',
                Lang.bind(this, function () {
                    this._onWindowEvent('allocation-changed');
                }));
        }
    },

    _onWindowRemoved: function (workspace, metaWin) {
        /* disconnect all the signals */
        this.LOG('_onWindowRemoved for %s', metaWin.get_title());
        this.disconnectTrackedSignals(metaWin.get_compositor_private());
    },

    /* Remove the window-added/removed listeners from the old workspace:
     * - add them to the current one (if onAllWorkspaces)
     * - resume (if switched to XPenguinWindow's workspace)
     * - pause (if switched away from XPenguinWindow's workspace)
     * and add them to the current one
     */
    _onWorkspaceChanged: function (shellwm, fromI, toI, direction) {
        this.LOG('_onWorkspaceChanged(%d): from %d to %d', this.get_workspace(), fromI, toI);
        if (this.get_workspace() === toI) {
            // BAH THIS IS NOT HAPPENING AS IT SHOULD
            return;
        }
        // from & to are indices.
        /* If you've changed workspaces, you need to change window-added/
         * removed listeners. */
        if (this.options.onAllWorkspaces) {
            /* update the toon region
             * Note: if you call this straight away and switch back into a
             * workspace *with* windows, it doesn't update until the next event.
             */
            Mainloop.idle_add(Lang.bind(this, function () {
                this._onWindowEvent('switch-workspace');
                return false;
            }));

            /* disconnect/reconnect window-added & window-removed events
             * we were listening to */
            if (this._listeningPerWindow) {
                let from = global.screen.get_workspace_by_index(fromI),
                    to = global.screen.get_workspace_by_index(toI);
                this.disconnectTrackedSignals(from);

                this.connectAndTrack(this, to, 'window-added',
                    Lang.bind(this, this._onWindowAdded));
                this.connectAndTrack(this, to, 'window-removed',
                    Lang.bind(this, this._onWindowRemoved));

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
                    this.get_workspace()) {
                this.pause(true, global.window_manager, 'switch-workspace',
                    function (dmy, fI, tI, dir) {
                        return (global.screen.get_workspace_by_index(tI) ===
                            this.get_workspace());
                    });
            } else {
                this.resume();
            }
        }
    }
};

/* Region class
 * This is basically a collection of rectangles, with a function to see
 * whether another rectangle overlaps the region.
 *
 * Use addRectangle to add another rectangle to the region.
 *
 * If you for some reason wish to iterate through the rectangles in the region,
 * then iterate through region.rectangles as if it were an array.
 */
function Region() {
    this._init.apply(this, arguments);
}

Region.prototype = {
    _init: function () {
        this.rectangles = [];
        this._extents = new Meta.Rectangle();
    },

    addRectangle: function (rect) {
        this.rectangles.push(rect);
        /* update _extents */
        this._extents = this._extents.union(rect);
    },

    clear: function () {
        this.rectangles = [];
        this._extents.x = 0;
        this._extents.y = 0;
        this._extents.width = 0;
        this._extents.height = 0;
    },

    /* determines whether the specified rect overlaps with the region.
     * x, y: x & y coordinates of the upper-left corner of the rectangle
     * width, height: width and height of the rectangle.
     *
     * Returns true if `rect` is partially or fully in the region,
     * and false if it's entirely out.
     *
     * You may omit the width & height arguments to simply see if an x, y point
     * falls within the region.
     */
    overlaps: function (x, y, width, height) {
        let rect = new Meta.Rectangle({x: x, y: y, width: width || 0, height: height || 0});
        /* quick check */
        if (this.rectangles.length === 0 || !this._extents.overlap(rect)) {
            return false;
        }

        let i = this.rectangles.length;
        while (i--) {
            if (this.rectangles[i].overlap(rect)) {
                return true;
            }
        }
        return false;
    }
};

/* Returns a list of WindowListener features that are supported by your version
 * of gnome-shell.
 * By default, returns a whitelist (i.e. list.opt TRUE means supported).
 * Otherwise, you can specificy a blacklist (list.opt TRUE means blacklisted).
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

    /* recalcMode needs grab-op-begin and grab-op-end for global.display,
     * not in GNOME 3.2 */
    list.recalcMode = !(GObject.signal_lookup('grab-op-begin', GObject.type_from_name('MetaDisplay')));
    if (!blacklist) {
        list.recalcMode = !list.recalcMode;
    }
    return list;
}

/* Utility logging function, use like sprintf */
function LOG() {
    let msg = arguments[0];
    if (arguments.length > 1) {
        [].shift.call(arguments);
        msg = ''.format.apply(msg, arguments);
    }
    log(msg);
}
