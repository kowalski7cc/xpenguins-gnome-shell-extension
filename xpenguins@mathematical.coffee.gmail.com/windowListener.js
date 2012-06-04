const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
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


const BLACK = Clutter.Color.get_static(Clutter.StaticColor.BLACK);
const YELLOW = Clutter.Color.get_static(Clutter.StaticColor.YELLOW);
const RED = Clutter.Color.get_static(Clutter.StaticColor.RED);
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
function get_compatible_options(blacklist) {
    /* enable everything by default */
    let defOpts = WindowListener.prototype.options;
    let list = {};
    for (let opt in defOpts) {
        if (defOpts.hasOwnProperty(opt)) {
            list[opt] = !blacklist;
        }
    }

    /* disable windowed mode, not working yet */
    list.onDesktop = blacklist || false;

    /* recalcMode needs grab-op-begin and grab-op-end for global.display,
     * not in GNOME 3.2
     */
    list.recalcMode = GObject.signal_lookup('grab-op-begin', GObject.type_from_name('MetaDisplay')) && !blacklist;
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
          *
          * TODO: could try listening to allocation-changed & disable for grab-op-begin until grab-op-end.
          *       also listen to 'minimize' and disable 'allocation-changed' until 'hide'.
          */

        /* dummy stuff for XPenguinsLoop compatibility */
        // TODO: run in particular window (i.e. onDesktop = false)
        // ignoreMaximised.
        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && this.options.hasOwnProperty(opt)) {
                this.options[opt] = i_options[opt];
            } else {
                XPUtil.LOG('  option %s not supported yet', opt);
            }
        }

        this._timeline = {
            _playing: false,
            start: function () { this._playing = true; },
            stop: function () { this._playing = false; },
            pause: function () { this._playing = false; },
            is_playing: function () { return this._playing; }
        };
        this._resumeSignal = {}; /* when you pause you have to listen for an event to unpause; use this._resumeID to store this. */
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */

        // NOTE: XPenguinsWindow is the *actor*.
        this.XPenguinsWindow = global.stage;
        // tidy? --> set up the get_workspace function for this.XPenguinsWindow...
        //  depends on this.onAllWorkspaces & has to be updated when this is.
        let tmp = this.options.onAllWorkspaces;
        this.options.onAllWorkspaces = null;
        this.changeOption('onAllWorkspaces', tmp);
    },

    /* add other initialisation code here,
     * stuff that has to get reset whenever the timeline restarts.
     */
    init: function () {
        XPUtil.LOG('init');
        this._connectSignals();
        this._initDrawing();
        this.drawingArea.show();
        this._updateToonWindows();
        this.draw();
        // like this._timeline.rewind
    },

    destroy: function () {
        this.clean_up();
    },

    clean_up: function () {
        XPUtil.LOG('clean_up');
        /* stop timeline if it's running */
        if (this._timeline.is_playing()) {
            XPUtil.LOG('stopping timeline');
            this._timeline.stop();
        }

        /* disconnect events */
        this._disconnectSignals();

        if (this.drawingArea) {
            global.stage.remove_actor(this.drawingArea);
            this.drawingArea.destroy();
        }
    },
/* start the main xpenguins loop: main.c
     * init() should have been called by now.
     */
    start: function () {
        XPUtil.LOG('[WL] start');
        if (this._timeline && this._timeline.is_playing()) {
            return;
        }
        this.init();
        this._timeline.start();
    },

    /* why not 'stop' ? */
    exit: function () {
        //if (!this._timeline.is_playing())
        //    return;

        this.clean_up(); // <- disconnect, stop timeline, ...
    },

    stop: function () {
        XPUtil.LOG('stop');
        this.drawingArea.hide();
        this.exit();
    },
    /* pauses the timeline & temporarily stops listening for events,
     * *except* for owner.connect(eventName) which sends the resume signal.
     */
    pause: function (hide, owner, eventName, cb) {
        XPUtil.LOG('[WL] pause');
        if (!this._timeline.is_playing()) {
            return;
        }
        /* pause timeline */
        this._timeline.pause();
        /* recalculate toon windows on resume */
        this._dirtyToonWindows('pause');
        /* temporarily disconnect events */
        // Nope - still need to listen to workspace-switched to unpause!
        this._disconnectSignals();

        /* hide drawing area? */
        if (hide) {
            this.drawingArea.hide();
        }

        /* connect up the signal to resume */
        // BIG TODO: could either set a signal for resume, *or* simply
        // don't disconnect signals on pause (just don't respond to them).
        // If many windows, seems a waste to do all the disconnect/reconnect every time they grab?
        if (owner) {
            this.connect_and_track(this._resumeSignal, owner, eventName, 
                Lang.bind(this, function () {
                    if (!cb || cb.apply(this, arguments)) {
                        this.disconnect_tracked_signals(this._resumeSignal);
                        this.resume();
                    }
                }));
        }
    },

    /* resumes timeline, connects up events */
    resume: function () {
        XPUtil.LOG('resume');
        if (this._timeline.is_playing()) {
            return;
        }
        /* reconnect events */
        this._connectSignals();
        /* recalculate toon windows */
        this._dirtyToonWindows('resume');
        /* resume timeline */
        this._timeline.start();
    },

    /* see whether timeline is playing */
    is_playing: function () {
        return this._timeline.is_playing();
    },

    /* called when configuration is changed.
     * ignorePopups, ignoreMaximised, onAllWorkspaces, onDesktop (TRUE FOR NOW),
     * ignored: blood, angels, squish, DEBUG.
     */
    // TODO: move to signal interface instead?
    changeOption: function (propName, propVal) {
        if (!this.options.hasOwnProperty(propName) || this.options[propName] === propVal) {
            return;
        }

        XPUtil.LOG('changeOption[WL]: %s = %s', propName, propVal);
        this.options[propName] = propVal;

        // ARGH compatibility issues....
        if (propName === 'onAllWorkspaces') {
            if (this.XPenguinsWindow instanceof Meta.WindowActor) {
                this.XPenguinsWindow.get_workspace = this.XPenguinsWindow.meta_window.get_workspace;
            } else {
                /* just to initially connect the window's workspace to listen
                 * to window-added & window-removed events
                 */
                if (this.options.onAllWorkspaces) {
                    // always return "current" workspace.
                    this.XPenguinsWindow.get_workspace = Lang.bind(global.screen, global.screen.get_active_workspace);
                } else {
                    // return the starting workspace.
                    let ws = global.screen.get_active_workspace();
                    this.XPenguinsWindow.get_workspace = function () { return ws; };
                }
            }
        }

        /* TRIGGER SOMETHING */
        if (this._timeline && this._timeline.is_playing()) {
            this._updateSignals();
        }
    },

    _updateSignals: function () {
        XPUtil.LOG('updateSignals');
        this._disconnectSignals();
        this._connectSignals();
    },


    _connectSignals: function () {
        XPUtil.LOG('connectSignals');
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */
        let ws = this.XPenguinsWindow.get_workspace();

        /* new or destroyed windows */
        if (this.options.ignorePopups) {
            /* Listen to 'window-added' and '-removed': these are the only windows that count. */
            this.connect_and_track(this, ws, 'window-added', Lang.bind(this, function () { this._dirtyToonWindows('window-added'); }));
            this.connect_and_track(this, ws, 'window-removed', Lang.bind(this, function () { this._dirtyToonWindows('window-removed'); }));
        } else {
            /* Listen to 'mapped' and 'destroyed': every window here counts */
            this.connect_and_track(this, global.window_manager, 'map', Lang.bind(this, function () { this._dirtyToonWindows('map'); }));
            this.connect_and_track(this, global.window_manager, 'destroy', Lang.bind(this, function () { this._dirtyToonWindows('destroy'); }));
        }


        /* resizing/moving */
        if (this.options.recalcMode === XPenguins.RECALC.ALWAYS) {
            // done in _onWindowAdded.
            this._listeningPerWindow = true;
        } else {
            /* if RECALC.PAUSE, pause on grab-op-begin with resume hook on grabOpEnd.
             * Otherwise, just recalc on grab-op-end.
             */
            // UPTO: GNOME 3.2 doesn't have grab-op-begin.
            // Can use imports.misc.config.PACKAGE_VERSION and
            // imports.util.extensionSystem.versionCheck.
            if (this.options.recalcMode === XPenguins.RECALC.PAUSE) {
                this.connect_and_track(this, global.display, 'grab-op-begin',
                    Lang.bind(this, function () {
                        XPUtil.LOG('grab-op-begin');
                        this.pause(false, global.display, 'grab-op-end');
                    }));
            } else {
                this.connect_and_track(this, global.display, 'grab-op-end',
                    Lang.bind(this, function () {
                        this._dirtyToonWindows('grab-op-end');
                    }));
            }
        }

        /* maximize, unmaximize */
        if (this.options.recalcMode !== XPenguins.RECALC.ALWAYS) {
            this.connect_and_track(this, global.window_manager, 'maximize', Lang.bind(this, function () { this._dirtyToonWindows('maximize'); }));
            this.connect_and_track(this, global.window_manager, 'unmaximize', Lang.bind(this, function () { this._dirtyToonWindows('unmaximize'); }));
        }   /* Otherwise allocation-changed covers all of the above. */

        /* minimize/unminimize */
        if (this.options.ignorePopups) {
            /* can either listen to notify::focus-app, or notify::minimize.
             * Done in _onWindowAdded.
             * Focus-app fires twice per window... */
            this._listeningPerWindow = true;
        } else {
            /* Otherwise 'map' covers unminimize */
            if (this.options.recalcMode !== XPenguins.RECALC.ALWAYS) {
                this.connect_and_track(this, global.window_manager, 'minimize', Lang.bind(this, function () { this._dirtyToonWindows('minimize'); }));
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
            this.connect_and_track(this, ws, 'window-added', Lang.bind(this, this._onWindowAdded));
            this.connect_and_track(this, ws, 'window-removed', Lang.bind(this, this._onWindowRemoved));

            this.connect_and_track(this, global.window_manager, 'switch-workspace', Lang.bind(this, this._onWorkspaceChanged));
            /* connect up existing windows */
            ws.list_windows().map(Lang.bind(this, function (metaWin) {
                if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                    this._onWindowAdded(null, metaWin);
                }
            }));
        }
        // FIXME LATER: events for the XPenguins Window.

    }, // _connectSignals

    _disconnectSignals: function () {
        XPUtil.LOG('disconnectSignals');
        /* disconnect all signals */
        this.disconnect_tracked_signals(this);

        let ws = this.XPenguinsWindow.get_workspace();
        ws.list_windows().map(Lang.bind(this, function (metaWin) {
            if (metaWin.get_window_type() !== Meta.WindowType.DESKTOP) {
                this._onWindowRemoved(null, metaWin);
            }
        }));
        this._listeningPerWindow = false;

        /* Should I do this? Or just in the 'terminate' signal? */
        /* Just have to make sure you connect it up *after* calling pause. */
        this.disconnect_tracked_signals(this._resumeSignal);
    },

    /***********
     * SIGNALS *
     ***********/

    /* Note: for now, per-window signals are *all* stored in the relevant actor. */
    _onWindowAdded: function (workspace, metaWin) {
        XPUtil.LOG('_onWindowAdded for %s', metaWin.get_title());
        let winActor = metaWin.get_compositor_private();
        if (!winActor) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them.
            Mainloop.idle_add(Lang.bind(this, function () {
                // TODO: check if it's on the current WS any more
                if (metaWin.get_workspace() === workspace) {
                    this._onWindowAdded(workspace, metaWin);
                }
                return false;
            }));
            return;
        }

        /* minimize/unminimize: notify::minimize */
        if (this.options.ignorePopups) {
            this.connect_and_track(winActor, metaWin, 'notify::minimized',
                Lang.bind(this, function () {
                    this._dirtyToonWindows('notify::minimized');
                }));
        }

        /* Stacking order. If we're not running on the desktop, then listen to 'raised' */
        if (!this.options.Desktop || this.options.ignoreMaximised) {
            this.connect_and_track(winActor, metaWin, 'raised', Lang.bind(this, function () {
                this._dirtyToonWindows('raised');
            }));
        }

        /* resized/moved windows */
        if (this.options.recalcMode === XPenguins.RECALC.ALWAYS) {
            this.connect_and_track(winActor, winActor, 'allocation-changed', Lang.bind(this, function () {
                this._dirtyToonWindows('allocation-changed');
            }));
        }
    },

    /* Note: if metaWin.get_compositor_private() is NULL, it means the window
     * is already destroyed - don't have to worry about disconnecting signals (?)
     */
    _onWindowRemoved: function (workspace, metaWin) {
        /* disconnect all the signals */
        XPUtil.LOG('_onWindowRemoved for %s', metaWin.get_title());
        this.disconnect_tracked_signals(metaWin.get_compositor_private());
    },

    // BIG TODO: listen to "our" workspace being destroyed.
    /* Remove the window-added/removed listeners from the old workspace:
     * - add them to the current one (if onAllWorkspaces)
     * - resume (if switched to XPenguinWindow's workspace)
     * - pause (if switched away from XPenguinWindow's workspace)
     * and add them to the current one
     */
    _onWorkspaceChanged: function (shellwm, fromI, toI, direction) {
        // from & to are indices.
        XPUtil.LOG('_onWorkspaceChanged: from %d to %d', fromI, toI);
        // TODO: what happens if you're in god mode?
        /* If you've changed workspaces, you need to change window-added/removed listeners. */
        if (this.options.onAllWorkspaces) {
            /* update the toon region */
            //this._dirtyToonWindows('_onWorkspaceChanged');
            //Note: if you call this straight away and switch back into a workspace *with* windows, it doesn't update until the next event.
            //However, if you're running a timeline it'll be fine.
            Mainloop.idle_add(Lang.bind(this, function () {
                this._dirtyToonWindows('_onWorkspaceChanged');
                return false;
            }));

            /* disconnect/reconnect window-added & window-removed events we were listening to */
            if (this._listeningPerWindow) {
                let from = global.screen.get_workspace_by_index(fromI);
                let to = global.screen.get_workspace_by_index(toI);
                this.disconnect_tracked_signals(from);

                this.connect_and_track(this, to, 'window-added', Lang.bind(this, this._onWindowAdded));
                this.connect_and_track(this, to, 'window-removed', Lang.bind(this, this._onWindowRemoved));

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
                    this.XPenguinsWindow.get_workspace()) {
                this.pause(true, global.window_manager, 'switch-workspace',
                    /* Note: binding done on pause end. do it here too for safety? */
                    function (dmy, fI, tI, dir) {
                        return (global.screen.get_workspace_by_index(tI) === 
                            this.XPenguinsWindow.get_workspace());
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
        XPUtil.LOG('_dirtyToonWindows %s', msg);
        /* do the following in the timeline for XPenguins */
        this._updateToonWindows();
        this.draw();
    },

    _updateToonWindows: function () {
        XPUtil.LOG('[WL] updateToonWindows');
        this.toon_windows.clear();
        /* Add windows to region. If we use list_windows() we wont' get popups,
         * if we use get_window_actors() we will. */
        let ws = this.XPenguinsWindow.get_workspace();
        let winList;
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
            if ((!this.options.onDesktop && winList[i] === this.XPenguinsWindow.meta_window) ||
                    (this.options.ignoreMaximised && winList[i].get_maximized() ===
                        (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL))) {
                break;
            }
            let rect = winList[i].get_outer_rect();
            rect.wid = winList[i].get_stable_sequence(); /* "Unique integer assigned to each MetaWindow on creation" */
            this.toon_windows.add_rectangle(rect);
        }
        // bah: toon_windows.intersect(new_rectangle) gives the rectangle bounding box. Not the shape.
        // winList[0].meta_window.get_frame_bounds(): meant to return a Cairo.region
        // "Unable to find module implementing foreign type cairo.Region"
        // BIG TODO: is there a more efficient way to rebuild than by completely destroying
        // the region each time?
    }, // _updateToonWindows


    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    connect_and_track: function (owner, subject, name, cb) {
        XPUtil.LOG('connect_and_track for %s', owner.toString());
        if (!owner.hasOwnProperty('_XPenguins_bound_signals')) {
            owner._XPenguins_bound_signals = [];
        }
        owner._XPenguins_bound_signals.push([subject, subject.connect(name, cb)]);
    },

    disconnect_tracked_signals: function (owner) {
        if (!owner) { return; }
        XPUtil.LOG('disconnect_tracked_signals for %s', owner.toString());
        if (!owner._XPenguins_bound_signals) { return; }
        owner._XPenguins_bound_signals.map(
            function (sig) {
                sig[0].disconnect(sig[1]);
                //XPUtil.LOG(' .. disconnecting signal ID %d from object %s',
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
        // BIG TODO: if XPenguinsWindow is a Meta.WindowActor, width/height are a bit off */
        /* NOTE: on restarting gnome shell, global.stage.width, height = 640, 480. */
        this.drawingArea = new Clutter.Group({
            width: this.XPenguinsWindow.get_width(),
            height: this.XPenguinsWindow.get_height(),
            x: 5,
            y: 5
        });
        this.drawingArea.set_scale(SCALE, SCALE);
        XPUtil.LOG('drawingArea: size %d, %d position %d, %d',
                this.drawingArea.width, this.drawingArea.height,
                this.drawingArea.x, this.drawingArea.y);

        global.stage.add_actor(this.drawingArea);
        this.drawingArea.hide();

        /* set up toonwindows */
        this.toon_windows = new Region.Region();
    },

    draw: function () {
        // in GNOME 3.4 this works. GNOME 3.2 (gir 1.0) this isn't a function?
        // (remove_all_children : function of Clutter.Actor)
        this.drawingArea.remove_all();

        // Background..
        let bg = new Clutter.Rectangle({ width: this.drawingArea.width,
                                         height: this.drawingArea.height,
                                         color: BLACK,
                                         border_color: RED,
                                         border_width: UNSCALED_BORDER_WIDTH
                                       });
        this.drawingArea.add_actor(bg);

        XPUtil.LOG('draw: %d windows', this.toon_windows.rectangles.length);
        // windows
        for (let i = 0; i < this.toon_windows.rectangles.length; ++i) {
            let rect = new Clutter.Rectangle({ width: this.toon_windows.rectangles[i].width,
                                               height: this.toon_windows.rectangles[i].height,
                                               x: this.toon_windows.rectangles[i].x,
                                               y: this.toon_windows.rectangles[i].y,
                                               color: WINDOW_COLOR,
                                               border_color: YELLOW,
                                               border_width: UNSCALED_BORDER_WIDTH });
            this.drawingArea.add_actor(rect);
        }
    }
};
