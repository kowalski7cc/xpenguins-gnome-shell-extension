/*
 * An object that tests the firing/connecting of all the signals.
 * For debugging.
 */
XPenguins.RECALC = {
    ALWAYS: 1 << 0,
    PAUSE : 1 << 1,
    END   : 1 << 2
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
    _init: function() {
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
        this.options = {
            ignorePopups: false,
            recalcMode: XPenguins.RECALC.ALWAYS,
            onDesktop: true
        };
        this.XPenguinsWindow = global.stage;
        this.XPenguinsWindow.get_workspace = global.screen.get_active_workspace;

        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */


        /* connect signals */
        let ws = this.XPenguinsWindow.get_workspace();

        /* new or destroyed windows */
        if ( this.options.ignorePopups ) {
            /* Listen to 'window-added' and '-removed': these are the only windows that count. */
            this.connect_and_track(this, ws, 'window-added', Lang.bind(this, this._dirtyToonWindows));
            this.connect_and_track(this, ws, 'window-removed', Lang.bind(this, this._dirtyToonWindows));
        } else {
            /* Listen to 'mapped' and 'destroyed': every window here counts */
            this.connect_and_track(this, global.window_manager, 'map', Lang.bind(this, this._dirtyToonWindows));
            this.connect_and_track(this, global.window_manager, 'destroy', Lang.bind(this, this._dirtyToonWindows));
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
            this.connect_and_track(this, global.window_manager, 'maximize', Lang.bind(this, this._dirtyToonWindows));
            this.connect_and_track(this, global.window_manager, 'unmaximize', Lang.bind(this, this._dirtyToonWindows));
            this.connect_and_track(this, global.window_manager, 'minimize', Lang.bind(this, this._dirtyToonWindows));
        } else {
            /* allocation-changed covers all of the above. */
        }

        /* unminimize. Options: notify::minimize for each window, or hope that notify::focus-app covers it.
         * TODO: check focus-app vs notify::minimize
         */
        if ( this.options.ignorePopups ) {
            this.connect_and_track(this, global.WindowTracker.get_default(), 'notify::focus-app', Lang.bind(this, this._dirtyToonWindows));
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
                this.connect_and_track(this, global.WindowTracker.get_default(), 'notify::focus-app', Lang.bind(this, this._dirtyToonWindows));
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

    },

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
           this.connect_and_track(winActor, metaWin, 'raised', Lang.bind(this, this._dirtyToonWindows));
        }

        /* resized/moved windows */
        if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
            this.connect_and_track(winActor, winActor, 'allocation-changed', Lang.bind(this, this._dirtyToonWindows));
        }
    },

    _onWindowRemoved: function(workspace, metaWin) {
        /* disconnect all the signals */
        LOG('_onWindowRemoved for %s', metaWin.get_title());
        this.disconnect_tracked_signals(metaWin.get_compositor_private());
    },

    /* TODO: _onWorkspaceChanged */
    _onWorkspaceChanged: function(shellwm, from, to, direction) {
        LOG('_onWorkspaceChanged');
    },

    _dirtyToonWindows: function() {
        LOG('_dirtyToonWindows');
    },

    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    connect_and_track: function(owner, subject, name, cb) {
        if ( !owner.hasOwnProperty('_XPenguins_bound_signals') ) {
            owner._XPenguins_bound_signals = [];
        }
        owner._XPenguins_bound_signals.push([subject, subject.connect(name,cb)]);
    },

    disconnect_tracked_signals: function(owner) {
        if ( !owner._XPenguins_bound_signals ) return;
        let i = owner._XPenguins_bound_signals.length;
        owner._XPenguins_bound_signals.map(
                function(sig) {
                    sig[0].disconnect(sig[1]);
                    LOG('disconnecting signal ID %d from object %s',
                         i, sig[0].toString());
        });
        delete owner._XPenguins_bound_signals;
    },

    _disable: function() {
        /* disconnect all signals */
        this.disconnect_tracked_signals(this);
        if ( this._listeningPerWindow ) {
            let ws = this.XPenguinsWindow.get_workspace();
            ws.list_windows().map(Lang.bind(this, function(metaWin) { this._onWindowRemoved(null, metaWin); }));
            this._listeningPerWindow = false;
        }
    },
}
