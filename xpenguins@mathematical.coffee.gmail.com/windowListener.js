const Lang = imports.lang;
const Mainloop = imports.mainloop;
/* Preliminary testing results.
 * NOTE: focus-app is NOT BEING CONNECTED W/ CURRENT DEFAULTS!
 * Notify::focus-app is not enough - need more like notify::focus-*window*.
 *  --> check StatusTitleBar.
 *
 */

/*
 * An object that tests the firing/connecting of all the signals.
 * For debugging.
 * Not to be included in the final extension.
 */
const XPenguins = {
    RECALC: {
        ALWAYS: 1 << 0,
        PAUSE : 1 << 1,
        END   : 1 << 2
    }
};

function LOG() {
    let msg = arguments[0];
    if ( arguments.length > 1 ) {
        [].shift.call(arguments);
        msg = ''.format.apply(msg, arguments);
    }
    global.log(msg);
    log(msg);
    //print(msg);
};

function WindowListener() {
    this._init.apply(this, arguments);
};

WindowListener.prototype = {
    _init: function(i_options) {
         /*
          * Everyone:
          * RESTACKING: either notify::focus-app OR {for each win: "raised"}
          * NEW WINDOWS/DESTROYED WINDOWS:
          *   IGNORE POPUPS: window-added and window-removed    for dirtying toon windows
          *  !IGNORE POPUPS: mapped       and destroyed         for dirtying toon windows
          * WINDOW STATE:
          *  RECALC.PAUSE:  grab-op-{begin,end} (will miss keyboard-resizes)
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
        // TODO: run in particular window (i.e. onDesktop=false)
        // ignoreMaximised.
        this.options = {
            ignorePopups: false,
            recalcMode: XPenguins.RECALC.ALWAYS,
            onDesktop: true,
            onAllWorkspaces: false
        };
        for ( let opt in i_options ) {
            if ( this.options.hasOwnProperty(opt) ) {
                this.options[opt] = i_options[opt];
            } else {
                LOG('  option %s not supported yet', opt);
            }
        }
        this.XPenguinsWindow = global.stage;
        if ( !this.XPenguinsWindow.get_workspace ) {
            /* just to initially connect the window's workspace to listen
             * to window-added & window-removed events
             */
            if ( this.options.onAllWorkspaces ) {
                // always return "current" workspace.
                this.XPenguinsWindow.get_workspace = global.screen.get_active_workspace;
            } else {
                // return the starting workspace.
                let ws = global.screen.get_active_workspace();
                this.XPenguinsWindow.get_workspace = function() { return ws; };
            }
        }

        this._timeline = {
            _playing: false,
            start: function() { this._playing = true; },
            end: function() { this._playing = false; },
            pause: function() { this._playing = false; },
            is_playing: function() { return this._playing }
        };
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */
    },

    /* add other initialisation code here,
     * stuff that has to get reset whenever the timeline restarts.
     */
    init: function() {
        LOG('init');
        this._connectSignals();
        // like this._timeline.rewind
    },

    destroy: function() {
        this.clean_up();
    },

    clean_up: function() {
        LOG('clean_up');
        let i;
        /* stop timeline if it's running */
        if ( this._timeline.is_playing() ) {
            this._timeline.stop();
        }

        /* disconnect events */
        this._disconnectSignals();
    },
/* start the main xpenguins loop: main.c 
     * init() should have been called by now.
     */
    start: function() {
        LOG('start');
        if ( this._timeline.is_playing() ) 
            return;
        this.init();
        this._timeline.start();
    },

    /* why not 'stop' ? */
    exit: function() {
        if ( !this._timeline.is_playing() ) 
            return;

        this.clean_up(); // <- disconnect, stop timeline, ...
    },

    stop: function () {
        LOG('stop');
        this.exit();
    },
    /* pauses the timeline & temporarily stops listening for events */
    pause: function() {
        LOG('pause');
        if ( !this._timeline.is_playing() )
            return;
        /* pause timeline */
        this._timeline.pause();
        /* recalculate toon windows on resume */
        this._dirtyToonWindows('pause');
        /* temporarily disconnect events */
        this._disconnectSignals();
    },

    /* resumes timeline, connects up events */
    resume: function() {
        LOG('resume');
        if ( this._timeline.is_playing() )
            return;
        /* reconnect events */
        this._connectSignals();
        /* recalculate toon windows */
        this._dirtyToonWindows('resume');
        /* resume timeline */
        this._timeline.start();
    },
    
    /* see whether timeline is playing */
    is_playing: function() {
        return this._timeline.is_playing();
    },

    /* called when configuration is changed.
     * ignorePopups, ignoreMaximised, onAllWorkspaces, onDesktop (TRUE FOR NOW),
     * ignored: blood, angels, squish, DEBUG.
     */
    // TODO: move to signal interface instead?
    changeOptions: function(propName, propVal) {
        if ( !this.options.hasOwnProperty(propName) || this.options[propName] == propVal ) 
            return;

        LOG('changeOptions: %s = %s', propName, propVal);
        this.options[propName] = propVal;
        /* TRIGGER SOMETHING */
        // UPTO TODO
        // this._updateSignals?
    },

    // TODO: is there a better way to do this?
    _updateSignals: function() {
        LOG('updateSignals');
        this._disconnectSignals();
        this._connectSignals();
    },

    _connectSignals: function() {
        LOG('connectSignals');
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */
        let ws = this.XPenguinsWindow.get_workspace();

        /* new or destroyed windows */
        if ( this.options.ignorePopups ) {
            /* Listen to 'window-added' and '-removed': these are the only windows that count. */
            this.connect_and_track(this, ws, 'window-added', Lang.bind(this, function() { this._dirtyToonWindows('window-added') }));
            this.connect_and_track(this, ws, 'window-removed', Lang.bind(this, function() { this._dirtyToonWindows('window-removed') }));
        } else {
            /* Listen to 'mapped' and 'destroyed': every window here counts */
            this.connect_and_track(this, global.window_manager, 'map', Lang.bind(this, function() { this._dirtyToonWindows('map')}));
            this.connect_and_track(this, global.window_manager, 'destroy', Lang.bind(this, function() { this._dirtyToonWindows('destroy') }));
        }


        /* resizing/moving */
        if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
            // done in _onWindowAdded.
            this._listeningPerWindow = true;
        } else {
            /* grab-op-begin and grab-op-end */
            if ( this.options.recalcMode == XPenguins.RECALC.PAUSE ) {
                this.connect_and_track(this, global.screen, 'grab-op-begin', Lang.bind(this, this._grabOpStarted));
            }
            this.connect_and_track(this, global.screen, 'grab-op-end', Lang.bind(this, this._grabOpEnded));
        }

        /* maximize, unmaximize, minimize */
        if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
            /* TODO: ignoreMaximised: do not connect 'maximize' signal up? */
            this.connect_and_track(this, global.window_manager, 'maximize', Lang.bind(this, function() { this._dirtyToonWindows('maximize') }));
            this.connect_and_track(this, global.window_manager, 'unmaximize', Lang.bind(this, function() { this._dirtyToonWindows('unmaximize') }));
            this.connect_and_track(this, global.window_manager, 'minimize', Lang.bind(this, function() { this._dirtyToonWindows('minimize') }));
        } else {
            /* allocation-changed covers all of the above. */
        }

        /* unminimize. Options: notify::minimize for each window, or hope that notify::focus-app covers it.
         * TODO: check focus-app vs notify::minimize
         */
        if ( this.options.ignorePopups ) {
            this.connect_and_track(this, global.WindowTracker.get_default(), 'notify::focus-app', Lang.bind(this, function() { this._dirtyToonWindows('notify::focus-app') }));
        } else {
            /* map covers this */
        }

        /* stacking order: NOTE: this *only* matters if we are not running on the desktop! */
        if ( !this.options.onDesktop ) {
            if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
                /* already listening to per-window events, so why not add 'raised' to the list? */
                // DONE IN _onWindowAdded.
                this._listeningPerWindow = true;
            } else if ( !this.options.ignorePopups ) {
                /* Not listening to any per-window events yet, so stick with notify::focus-app
                 * and hope for the best.
                 * Don't connect if we've already done so in this.options.ignorePopups above (for unminimize)
                 */
                this.connect_and_track(this, global.WindowTracker.get_default(), 'notify::focus-app', Lang.bind(this, function() { this._dirtyToonWindows('notify::focus-app') }));
            }
        }

        /*** if listening to any events from each window, we need to listen to window-added and window-removed
             in order to add the appropriate listeners. 
             Then, we also need to listen to workspace-changed to reconnect these signals.

             Note - we do not listen to signals emitted by windows that do not trigger 'window-added'.
         ***/
        // FIXME: is it a problem that I potentially have *two* hooks on window-added? (if ignorePopups is false)?
        // CHECK: should we listen to 'mapped' and add signals there, or is window-added,removed enough?
        if ( this._listeningPerWindow ) {
            this.connect_and_track(this, ws, 'window-added', Lang.bind(this, this._onWindowAdded));
            this.connect_and_track(this, ws, 'window-removed', Lang.bind(this, this._onWindowRemoved)); 

            this.connect_and_track(this, global.window_manager, 'switch-workspace', Lang.bind(this, this._onWorkspaceChanged));
            /* connect up existing windows */
            ws.list_windows().map(Lang.bind(this, function(metaWin) { this._onWindowAdded(null, metaWin); }));
        }
        // FIXME LATER: reduce cases. This RECALC business is silly - just recalc *always* !
        // FIXME LATER: events for the XPenguins Window.

    }, // _connectSignals

    _disconnectSignals: function() {
        LOG('disconnectSignals');
        /* disconnect all signals */
        this.disconnect_tracked_signals(this);
        if ( this._listeningPerWindow ) {
            let ws = this.XPenguinsWindow.get_workspace();
            ws.list_windows().map(Lang.bind(this, function(metaWin) { this._onWindowRemoved(null, metaWin); }));
            this._listeningPerWindow = false;
        }

    },

    /***********
     * SIGNALS *
     ***********/
    /* Note: for now, per-window signals are *all* stored in the relevant actor. */
    _onWindowAdded: function(workspace, metaWin) {
        LOG('_onWindowAdded for %s', metaWin.get_title());
        let winActor = metaWin.get_compositor_private();
        if ( !winActor ) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them.
            Mainloop.idle_add(Lang.bind(this, function() { 
                // TODO: check if it's on the current WS any more
                                                this._onWindowAdded(workspace, metaWin); 
                                                return false; 
            }));
            return;
        }
        
        /* Stacking order. If we're not running on the deskopt & listening to 'raised' */
        if  ( !this.options.onDesktop && this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
           this.connect_and_track(winActor, metaWin, 'raised', Lang.bind(this, function() { this._dirtyToonWindows('raised') }));
        }

        /* resized/moved windows */
        if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
            this.connect_and_track(winActor, winActor, 'allocation-changed', Lang.bind(this, function() { this._dirtyToonWindows('allocation-changed') }));
        }
    },

    /* Note: if metaWin.get_compositor_private() is NULL, it means the window
     * is already destroyed - don't have to worry about disconnecting signals (?)
     */
    _onWindowRemoved: function(workspace, metaWin) {
        /* disconnect all the signals */
        LOG('_onWindowRemoved for %s', metaWin.get_title());
        this.disconnect_tracked_signals(metaWin.get_compositor_private());
    },

    // BIG TODO: listen to "our" workspace being destroyed.
    /* Remove the window-added/removed listeners from the old workspace:
     * - add them to the current one (if onAllWorkspaces)
     * - resume (if switched to XPenguinWindow's workspace)
     * - pause (if switched away from XPenguinWindow's workspace)
     * and add them to the current one
     */
    _onWorkspaceChanged: function(shellwm, from, to, direction) {
        LOG('_onWorkspaceChanged');
        // TODO: what happens if you're in god mode?
        /* If you've changed workspaces, you need to change window-added/removed listeners. */
        if ( this.options.onAllWorkspaces ) {
            /* update the toon region */
            this._dirtyToonWindows('_onWorkspaceChanged');

            /* disconnect/reconnect window-added & window-removed events we were listening to */
            if ( this._listeningPerWindow ) {
                this.disconnect_tracked_signals(from);

                this.connect_and_track(this, to, 'window-added', Lang.bind(this, this._onWindowAdded));
                this.connect_and_track(this, to, 'window-removed', Lang.bind(this, this._onWindowRemoved)); 

                /* connect up existing windows */
                to.list_windows().map(Lang.bind(this, function(metaWin) { this._onWindowAdded(null, metaWin); }));
            }
        } else {
            /* hide the toons & pause if we've switched to another workspace */
            if ( to != this.XPenguinsWindow.get_workspace() ) {
                //this.hideToons();
                this.pause(); // TODO: also pause signals??
            } else {
                //this.showToons();
                this.resume();
            }
        }
    },

    /*********************
     *     FUNCTION      *
     *********************/
    _dirtyToonWindows: function(msg) {
        // hmm, in debugging mode I'd also like to track why.
        LOG('_dirtyToonWindows %s', msg);
    },

    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    connect_and_track: function(owner, subject, name, cb) {
        LOG('connect_and_track for %s', owner.toString());
        if ( !owner.hasOwnProperty('_XPenguins_bound_signals') ) {
            owner._XPenguins_bound_signals = [];
        }
        owner._XPenguins_bound_signals.push([subject, subject.connect(name,cb)]);
    },

    disconnect_tracked_signals: function(owner) {
        LOG('disconnect_tracked_signals for %s', owner.toString());
        if ( !owner ) return;
        if ( !owner._XPenguins_bound_signals ) return;
        let i = owner._XPenguins_bound_signals.length;
        owner._XPenguins_bound_signals.map(
                function(sig) {
                    sig[0].disconnect(sig[1]);
                    LOG(' .. disconnecting signal ID %d from object %s',
                         i, sig[0].toString());
        });
        delete owner._XPenguins_bound_signals;
    },

};
