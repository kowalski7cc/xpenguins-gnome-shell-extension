const Clutter = imports.gi.Clutter;

const Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const XPUtil = Extension.util; 
const Toon   = Extension.toon.Toon;
const Theme  = Extension.theme.Theme;
const Region = Extension.region;
/* Far away todos:
 * - treat the top activities bar as solid?
 * - test w/ gnome-panel
 * - test w/ autohiding stuff
 * - test w/ frippery bottom panel/dock/etc
 *
 * NOTES:
 * - if Nautilus manages the desktop there is a desktop window.
 *   It starts *underneath* the top activities bar.
 *   Shows on all workspaces.
 *   Shows *underneath* windows. Cannot raise.
 *
 * - global.stage starts also including the top activities bar
 *   Shows on all workspaces.
 *   Shows *on top*.
 */

/************************
 * X penguins main loop *
 ************************/
function XPenguinsLoop() {
    this._init.apply(this, arguments);
};

/* When to recalculate window position/size changes.
 * ALWAYS: always (even during the resize/move)
 * PAUSE : pause until resize/move has finished, then recalc at the end.
 * END   : run while resize/move is in progress, but only recalculate at the end. (So toons could walk off-window).
 */
XPenguins.RECALC = {
    ALWAYS: 1 << 0,
    PAUSE : 1 << 1,
    END   : 1 << 2
};

XPenguinsLoop.prototype = {
    log: function(msg) {
        if ( this.options.DEBUG ) {
            global.log(msg);
            print(msg);
            log(msg);
            // make popup
            let label = new St.Label({ text: msg }); // style-class
            global.stage.add_actor(label);
            let monitor = Main.layoutManager.primaryMonitor;
            label.set_position(Math.floor (monitor.width / 2 - label.width / 2), Math.floor(monitor.height / 2 - label.height / 2));
            Mainloop.timeout_add(1000, function () { label.destroy(); });
        }
    },

    warn: function(msg) {
        global.log(msg);
        print(msg);
        log(msg);
    }

    /* options:
     * DEBUG
     * PENGUIN_MAX
     * ignore maximised windows
     * npenguins
     */
    defaultOptions: function() {
        return {
        DEBUG: true,
        PENGUIN_MAX: 256,

        /* Load average checking: kill penguins if load is too high 
        --nice loadaverage1 loadaverage2
           Start killing toons when the 1-min averaged system load exceeds loadaverage1; 
            when it exceeds  loadaverage2  kill  them  all.  
           The toons  will  reappear  when  the load average comes down. 
           The load is checked every 5 seconds by looking in /proc/loadavg, so this
            option only works under unices that implement this particular pseudo file (probably just Linux). 
            When there are no  toons  on  the screen, XPenguins uses only a miniscule amount of CPU time - 
            it just wakes up every 5 seconds to recheck the load.
        */
        load_check_interval : 5000, /* ms between load average checks */
        load_cycles, /* number of frames between load average checks */
        load1 : -1.0, /* Start killing penguins if load reaches this amount */
        load2 : -1.0, /* All gone by this amount (but can come back!) */


        /* more settings */
        /* The maximum number of penguins that will exist in this run (up to PENGUIN_MAX).
         * Default defined by the theme */
        nPenguins : -1,
        // What theme to use. default Penguins
        themes : [],
        edge_block : Toon.SIDEBOTTOMBLOCK,

        /* flags */
        /* Do not show any cherubim flying up to heaven when a toon gets squashed. */
        angels : true, 
        /* Do not show gory death sequences */
        blood : true, 
        /* Ignore maximised windows */
        ignoreMaximised : true,
        /* Ignore popup windows. This means right-click menus, tooltips, and window menus.
         * Basically, anything that fires "window-added" is included by default,
         * and anything that fires "map" but not "window-added" is included in ignorePopups.
         */
        ignorePopups : false, 
        /* Enable the penguins to be squished using any of the mouse buttons.
         * Note that disables any existing function of the mouse buttons.
         * Used to be toon_squish, TOON_SQUISH.
         */
        squish : false, // [FIXME: not implemented]
        /* what happens when we switch workspaces
         * hmm, just store workspace instead? 
         */
        workspace: 0, // -1: always on visible. Otherwise, index of workspace.
        onAllWorkspaces: false, // uhh... this works best with XPenguinsLoop.
        onDesktop: true, /* whether it's running on the desktop or in a window */
     
        recalcMode: XPenguins.RECALC.ALWAYS, 



        // trigger an _onUpdateWindows only:
        // ignoreMaximised
        // ignorePopups
        // Triggers more
        // onAllWorkspaces: _onUpdateWindows + pause/resume
        // ???
        // angels, blood: what about existing toons?
        // squish: enables god mode
        //


        /* maximum amount a window can move and the penguin can still cling on */
        // set in main.c
        max_relocate_up:    16,
        max_relocate_down:  16,
        max_relocate_left:  16,
        max_relocate_right: 16,

        // possibly unnecessary/can't be implemented/depreciate
        sleep_msec : 0, // <-- delay in milliseconds between each frame.
        /* Toons  regard  all  windows  as  rectangular.  */
        /* Possible slight speedup but if you use a window manager with shaped windows */
        /*  your toons might look like they're walking on thin air. */
        rectangularWindows : false,
        /* Load all available themes and run them simultaneously */
        all : false
        };
    },

    is_playing: function() {
        return this._timeline.is_playing();
    }

        // TODO: if xpenguins_active then do something.
    set_themes: function( themeList ) {
        this.options.themes = themeList;
    },

    _init: function(i_options) {

        /* set options */
        let options = this.defaultOptions();
        /* copy over custom options */
        for ( opt in i_options ) {
            // warn of unknown options
            if ( opt in options ) {
                this.warn('Warning: unknown option %s, ignoring'.format(opt));
            } else {
                options[opt] = i_options[opt];
            }
        }
        this.options = options;

        /* Note: to set up the rest of the variables,
         * pick set a theme, and *then* call init().
         */
        this._signals = [];
        this._workspaces = [];
        this._currentWorkspace = null;
    },

    /* when you send the stop signal to xpenguins (through the toggle) */
    stop: function() {
        this._onInterrupt();
    },

    /* when you really want to kill xpenguins 
     * (ie exit sequence has finished)
     * xpenguins_exit()
     */
    exit: function() {
        if ( !this._timeline.is_playing() ) 
            return;

        this.clean_up();
    },

    /* start the main xpenguins loop: main.c 
     * init() should have been called by now.
     */
    start: function() {
        if ( this._timeline.is_playing() ) 
            return;
        this.init();
        this._timeline.start();
    },

    /* pauses the timeline & temporarily stops listening for events */
    pause: function() {
        if ( !this._timeline.is_playing() )
            return;
        /* pause timeline */
        this._timeline.pause();
        /* recalculate toon windows on resume */
        this._dirtyToonWindows();
        /* temporarily disconnect events */
        this._disconnectSignals();
    },

    /* resumes timeline, connects up events */
    resume: function() {
        if ( this._timeline.is_playing() )
            return;
        /* reconnect events */
        this._connectSignals();
        /* recalculate toon windows */
        this._dirtyToonWindows();
        /* resume timeline */
        this._timeline.start();
    },

    reset: function() {
        this.clean_up();
        this.init();
    },

    /* ToonFinishUp in toon_end.c
     */
    clean_up: function() {
        let i;
        /* stop timeline if it's running */
        if ( this._timeline.is_playing() ) {
            this._timeline.stop();
        }

        /* remove god mode */
        if ( opt.squish || this._godModeID ) {
            this._onDisableGodMode();
        }

        /* disconnect events */
        if ( this._sleepID ) {
            Mainloop.source_remove(this._sleepID);
        } 
        if ( this._newFrameID ) {
            this._timeline.disconnect(this._newFrameID);
        }
        this._disconnectSignals();

        /*
        // technically just look at this.options.workspace
        i=global.screen.n_workspaces;
        while ( i-- ) {
            let ws = global.screen.get_workspace_by_index(i);
            if ( ws._XPenguinsWindowAddedId ) {
                ws.disconnect(ws._XPenguinsWindowAddedId);
                ws._XPenguinsWindowAddedId = null;
            }
        }
        // TODO
        this._workspaces = [];
        */

        /* remove toons from stage & destroy */
        i = this._penguins.length;
        while ( i-- ) {
            this._stage.remove_actor( this._penguins[i].actor );
            this._penguins[i].destroy();
        }

        /* remove toonDatas from the stage */
        i = this._theme.ToonData.length;
        while ( i-- ) {
            this._stage.remove_actor( this._theme.ToonData[i].texture );
        }

        /* destroy theme */
        if ( this._theme ) {
            this._theme.destroy();
        }

    },

    /* Initialise all variables & load themes & initialise toons.
     * should be called before start()
     * xpenguins_start
     */
    init: function() {

        /* signals */
        this._sleepID = null;
        this._newFrameID = null;

        /* variables */
        this._theme = null;
        this._penguins = [];
        this._workspaces = [];
        /* The number of penguins that are active or not terminating.
         * When 0, we can call xpenguins_exit()
         */
        this._toon_number = 0;
        this._timeline = null;
        this._cycle = 0;
        this._exiting = false;
        this._stage = null;

        /* Laziness (can do with(this.options) { ... } too) */
        let opt = this.options;
        /* If they set onAllWorkspaces but are running in a window,
         * unset onAllWorkspaces
         * TODO: what if window is 'always on visible workspace'? --> connect window's workspace-changed
         */
        if ( opt.onAllWorkspaces && !opt.onDesktop ) {
            this.log(_('Warning: onAllWorkspaces is TRUE but running in a window, setting onAllWorkspaces to FALSE'));
            opt.onAllWorkspaces = false;
        }

        /* Set the number of penguins */
        if ( opt.nPenguins >= 0 ) {
            this.set_number(opt.nPenguins); 
            // same as this._toon_number = opt.nPenguins;
        }

        /* See if load averaging will work */ 
        if ( opt.load1 >= 0 ) {
            let load = XPUtil.loadAverage();
            if ( load < 0 ) {
                this.log(_("Warning: cannot detect load averages on this system"));
                opt.load1 = -1;
                opt.load2 = -1;
            } else {
                opt.load_cycles = opt.load_check_interval/opt.sleep_msec;
            }
        }

        /* create timeline */
        /* NOTE: GNOME 3.2 has Clutter-1.0, and no set_repeat_count.
         * --> do timeline.set_loop(true);
         * in GNOME 3.4, use timeline.set_repeat_count(...);
         * Clutter.threads_add_timeout
         */
        let timeline = new Clutter.Timeline();
        this._timeline.set_loop(true);

        /* Load theme into this._theme */
        this._theme = new Theme.Theme( opt.themes );

        /* theme-specific options */
        if ( !opt.sleep_msec ) {
            opt.sleep_msec = this._theme.delay;
        }
        this._timeline.set_duration(opt.sleep_msec); // ??
        // BIGTODO: I ONLY WANT *ONE FRAME* PER TIMELINE?
        /* if the user hasn't specified nPenguins, take default from theme */
        if ( opt.nPenguins < 0 ) {
        // TODO: initially set the slider to the default from the theme
            opt.nPenguins = this._theme.total;
        }

        /* Set up the window we're drawing on.
         * Note: would like to treat it all the same whether it's on the
         * desktop or the windows.
         * At the moment (GNOME 3.2-->3.4, Clutter 1.10) window actors are
         * Clutter.Groups, so whether XPenguinsWindow is global.stage
         * or the window actor shouldn't matter.
         *
         * In Clutter 1.11 Clutter.Group is depreciated in favour of 
         * Clutter.Actor, but we'll deal with that when it comes.
         */
        if ( opt.onDesktop ) {
            /* Treat them all as a Clutter.Group.
             * You could also do global.stage.get_nth_child[0] for the window clutter group
             */
            this.XPenguinsWindow = global.stage;
            if ( !this.XPenguinsWindow.get_workspace ) {
                /* temporary only - just to initially connect the window's workspace to listen
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
        } else {
            // TODO: specify somehow.
        }

        /* store the workspaces we're interested in, 
         * i.e. populate this._workspaces.
         * done in connectSignals 
         */

        /* set up god mode */
        if ( opt.squish ) {
            this._onEnableGodMode();
        }

        /* set up toon_windows */
        this._toon_windows = new Region.Region();
        this._updateToonWindows();


        /* set up global vars to feed in to the toons */
        if ( opt.workspace >= 0 ) {
            opt.workspace = global.screen.get_active_workspace();
        }
        this.global = {
            XPenguinsWindow = this.XPenguinsWindow,
            XPenguinsWindowWidth: this.XPenguinsWindow.get_width(),
            XPenguinsWindowHeight: this.XPenguinsWindow.get_height(),
            ToonData: this._theme.ToonData,
            //options: opt, // <-- do I really want to lug the *whole* structure around?!
            edge_block: opt.edge_block,
            toon_windows: this._toon_windows,
            // TODO: must change when window changes workspace!
            workspace: opt.workspace
        };

        /* set the genus of each penguin, respecting the ratios in theme.number? */
        /* Xpenguins makes one of each type, & then give the requested number
         * per genus, so if your genus is at the end and you run out of penguins,
         * then you miss out on all but one.
         * Also initialise them.
         */
        let genus_numbers = theme.number.map(function(i) { return Math.floor(i/theme.total*opt.nPenguins) });
        let leftover = opt.nPenguins - genus_numbers.reduce(function (x,y) { x+y }); // note: guaranteed <= theme.ngenera
        while ( leftover ) { // genera 0 to leftover-1 get 1 extra.
            genus_numbers[--leftover] += 1;
        }
        for ( i=0; i<genus_numbers.length; ++i ) {
            while ( genus_numbers[i] ) {
                /* Initialise toons */
                this._penguins.push( new Toon.Toon( global,
                                                    {genus:i} ); // will call .init() automatically
                genus_numbers[i]--;
            }
        }

        /* set the stage */
        // TODO: other windows. Want the stage + the window actor?
        // You can set actor == stage if it's a window: add_actor works.
        // *HOWEVER* adding a rectangel to (0,0) of a window appears to set it a bit outside its bounds.
        let i = this._theme.ToonData.length;
        /* add ToonDatas to the stage so clones can be added properly */
        while ( i-- ) {
            this._stage.add_actor(this._theme.ToonData[i].texture);
            this._theme.ToonData[i].texture.hide();
        }
        /* add toons to the stage */
        i = this._penguins.length;
        while ( i-- ) {
            this._stage.add_actor( this._penguins[i].actor );
            this._penguins[i].Draw();
            this._penguins[i].show(); // TODO: hide?
        }

        /* Connect signals */
        this._newFrameID = this._timeline.connect('new-frame',
                Lang.bind( this, this._frame ));
        // signals to update toon windows:
        // windows moved, mapped, unmapped.
        // Want to know when XPenguinsWindow CHANGES

        this._signals = [];
        this._windowSignals = [];
        this._connectSignals();

        /****************************************/
        //windows-changed
        //NOTE: it might be easier to just recalculate

        /* When the number of workspaces is changed, update listeners */
        // captured-event?
        /* When a workspace is added, listen for window-added/removed events on that workspace */
        /* when the XPenguins window closes, exit straight away */
        /* when the XPenguins window moves, we need to change origins?! */
        /* when the XPenguins window changes workspace, we need to re-jig the event listeners */

        /* Have a look at a list of window-event chantges here, because gfxmonk
         * also maintains an up-to-date window region
        https://github.com/gfxmonk/shellshape/blob/master/shellshape/workspace.js
         - window-added
         - window-removed
         - notify::minimized on a window
         - position-changed on a window
         - size-changed on a window
         * Jasper notes: grab-op-{begin,end} for move/resize.
         */
        // BIG TODO: this.windowActor ???
    },

    /***** UPDATING TOON WINDOWS *****/
    /* connects up events required to maintain toon_windows as an accurate
     * snapshot of what the windows on the workspace look like
     */
    _connectSignals: function() {
        /* NOTES: 
         * new window   => window-added, map
         * close window => window-removed, destroy
         *
         * maximize     => maximize, 2xposition change, 1xsize change. Why 2? decoration?
         * unmaximize   => unmaximize, 2xposition change, 1xsize change
         * minimize     => minimize, position change
         * unminimize   => map, WINDOW:notify::minimize, position change
         * (MORE IF MAXIMUS IS ON)
         * CHROME: 4x position change! (maximize: 2 for win + deco, then 2 for undeco?)
         *
         * window moves workspace => nothing (map/destroy/max/unmax/min/map).
         * **Includes file menus and message tray**
         *
         * resize => WINDOW:position-changed, size-changed. (if interactive) grab-op-begin/end
         * move   => WINDOW:position-changed, (if interactive) grab-op-begin/end
         *        * Also depends: do you want to recalculate while resize/move in progress?
         *          (say you do it slowly).
         *
         * tracker:   maximize, unmaximize, minimize, map, destroy
         * workspace: window-added, window-removed
         * screen:    grab-op-begin, grab-op-end
         * window:    notify::minimize, notify::size-changed, notify::position-changed, raised,
         *
         * What about stacking order?
         * window: raised
         * screen: restacked: appears to happen *twice* for each window? But it does seem to get everything...
         *                    --> appears to happen very often though - on new window/kill window, resize
         *                    move, etc --> JUST USE THIS?
         * window-tracker: **notify::focus-app  (same, *twice*? --> but I had guake so that's probably it)
         *
         * XPenguins window:
         * - raised (covered above?)
         * - destroyed (covered above?)
         * - size/position changed (covered above?)
         * - *changes workspace*: toons go with it!
         * - minimized: pause
         * - mapped:    resume
         *
         *
         * SUMMARY:
         * 1) if ignorePopups:    anything with window-added is included
         *    if !ignorePopups:   everything from 'map'
         *
         * 1) look at this.options.recalcMode.
         *    if XPenguins.RECALC.ALWAYS : listen to position-changed PER WINDOW, (UPDATE: allocation-changed + minimize more efficient?).
         *                                 window-added on CURRENT WORKSPACE,
         *                                 workspace-changed to:
         *                                  if onAllWorkspaces: disconnect old windows/reconnect new/listen to window-added.
         *                                  ELSE
         *                                  if leaving XPenguins ws: pause
         *                                  if returning to XPenguins ws: resume
         *
         *                                  The above covers new, destroy, max, unmax, min, unmin.
         *                                  Listen to STACKING ORDER CHANGE: notify::raise OR notify::focus-app
         *                                  
         *                                  if !IGNORE MENUS: must *additionally* listen to map/destroy.
         *
         *    ELSE                        : listen to max, unmax, min
         *                                  listen to grab-op-{being,end} for resizes (NOTE: tiling shortcuts get around this? FIXME)
         *
         *                                  if IGNORE MENUS: window-added, window-removed, 
         *                                                   workspace-changed to:
         *                                                    if onAllWorkspaces: disconnect/reconnect window-added & window-removed
         *                                                    ELSE
         *                                                    if leaving XPenguins ws: pause
         *                                                    if returning to XPenguins ws: resume
         *                                  listen to STACKING ORDER CHANGE: notify::focus-app (<-- covers unmin too? FIXME)
         *                                  ELSE           : map, destroy (covers unmin)
         *                                                   workspace-changed to:
         *                                                    if onAllWorkspaces: dirty toon windows
         *                                                    ELSE
         *                                                    if leaving XPenguins ws: pause
         *                                                    if returning to XPenguins ws: resume
         *                                  listen to STACKING ORDER CHANGE: notify::focus-app 
         * (Idea is to only listen to what you need so as to prevent lots of bogus events firing, for example 
         *  map/destroy for dropdown menus when you're ignoring them anyway)
         *
         * Hmm. If running in a window, then listen to *that window*:
         * - workspace-changed
         * - 
         *
         * allocation-changed: resize, move, max, min (one per animation frame), unmax, NOT unmin.
         *                     w/ max/unmax, *one* signal per window change.
         *                     However with minimise, one signal per animation frame as it resizes.
         *                      --> listen to 'minimise' -> disable until HIDE then enable?
         * Unminimize can be covered by 'focus-app' changed, I think.
         * paint : NO once per refresh rate!
         */
         /*
          * Everyone:
          * RESTACKING: either notify::focus-app OR {for each win: "raised"}
          * NEW WINDOWS/DESTROYED WINDOWS:
          *   IGNORE POPUPS: window-added and window-removed    for dirtying toon windows
          *  !IGNORE POPUPS: mapped       and destroyed         for dirtying toon windows
          * WINDOW STATE:
          *  EFFICIENT:     grab-op-{begin,end} (will miss keyboard-resizes)
          *                 maximize
          *                 unmaximize
          *                 minimize
          *  NON-EFFICIENT: {for each winActor: allocation-changed}
          * UNMINIMISE: 
          *   IGNORE POPUPS: nothing <hope for focus-app. Otherwise, can try winActor:show>
          *  !IGNORE POPUPS: nothing <mapped>
          *
          */
        if ( this.options.ignorePopups ) {
            /* Listen to 'window-added': these are the only windows that count. */
        } else {
            /* Listen to 'mapped': every window here counts */
        }
        /** window resize/move **/
        if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
            /* recalc every frame of the resize, i.e. every time position-{changed,moved} is fired even if
             * it is during a grab operation.
             * Requires listening to position-changed & size-changed *for each window*.
             * This also covers maximize, unmaximize, minimize, unminimize, move, resize, destroy.
             * Note that *all* the above events fire a position-changed event (including resizing), 
             * so size-changed may be unnecessary. 
             * (FIXME: Can size-changed fire without position-changed?
             *         For now disable size-changed for efficiency).
             * 
             */
            /* connect *each window* */
            // BIG TODO: it seems that min, max, unmin, unmax, destroy, size, position change *all* fire a position change event.
            // So size-change may be unnecessary.
            //this._windowSignals.push('size-changed');
            this._windowSignals.push('position-changed');
            /* raised or notify::focus-app - which one? May as well do RAISE since we're doing window signals. */
            // although RAISE is on the METAWINDOW. So is workspace-changed.
            this._windowSignals.push('raised'); // <-- TODO on window not actor.

            let ws = this.XPenguinsWindow.get_workspace();
            let winList = ws.list_windows();
            for ( let i=0; i<winList.length; ++i ) {
                this._connectWindowSignals(winList[i].get_compositor_private());
            }
            /* Listen to window-added on current workspace in order to add per-window signals,
             * and listen to workspace-switch to reset these signals
             */
            this._signals.push(global.window_manager.connect('switch-workspace', Lang.bind(this, this._onWorkspaceChanged)));
            ws._XPenguinsWindowAddedID = ws.connect('window-added', Lang.bind(this, this._onWindowAdded));

            /* if you want to include menus ... (not recommended if you're on the workspace)
             * Then you need to listen to map/destroy.
             * You will get heaps of double-firing! (window-added + map e.g.)
             */
            // BIG TODO: untracked windows! (gnome-panel --replace are untracked - hide/autohide?)
            this._solidWindowTypes = [ Meta.WindowType.NORMAL, 
                                       Meta.WindowType.DOCK,    // gnome-panel
                                       Meta.WindowType.UTILITY, // non-transient small persistent utility window. 
                                                                // GIMP toolbox/tearaway dialogs are these.
                                       Meta.WindowType.TOOLBAR, // Tearoff toolbars. e.g. in openoffice. Persistent. XPenguins listens to.
                                       Meta.WindowType.DIALOG,  // Do you REALLY want to quit?
                                       Meta.WindowType.MODAL_DIALOG,// (eg) the 'About' window in empathy
                                            ]
            /* XPenguins --ignore-popups appears to still listen to DIALOG, MODAL_DIALOG, UTILITY, TOOLBAR, etc.
             * Ignores dropdown-menu, popup-menu, tooltip, combo, ...
             */
            /* sort of making this up. XPenguins: anything with save_under is a popup */
            if ( !this.options.ignorePopups ) {
                /* TODO */
                this._solidWindowTypes.push( Meta.WindowType.SPLASHSCREEN );
                this._solidWindowTypes.push( Meta.WindowType.NOTIFICATION );
                /* 'popup' windows */
                this._solidWindowTypes.push( Meta.WindowType.MENU );
                this._solidWindowTypes.push( Meta.WindowType.DROPDOWN_MENU );  // e.g. Terminal's 'File' menu.
                this._solidWindowTypes.push( Meta.WindowType.POPUP_MENU );     // right-click menu
                this._solidWindowTypes.push( Meta.WindowType.TOOLTIP );        // tooltips also trigger 'mapped' events.
                this._solidWindowTypes.push( Meta.WindowType.COMBO );          // drop-down box (these can go out of the parent window)
                this._solidWindowTypes.push( Meta.WindowType.OVERRIDE_OTHER ); // the thing that pops up telling you how big the window is whilst resizing.
            }
            /* BIG TODO: dropdown menus from the status buttons and message tray/notifications *DO NOT* trigger mapped events in GNOME 3.2
             */
            if ( !this.options.ignoreMenus ) {
                /* override redirect window types */
            }
            /* Dragging a file from nautilus to somewhere else - in this case would have to track where
             * the icon was in order to squash the relevant toons, so won't do it for now.
            FIXME: Xpenguins treats this as a window. How do we? Listen to 'mapped'?
            this._solidWindowTypes.push( Meta.WindowType.DND );            // e.g. dragging an file from nautilus somewhere else.
             */
             /* --> IGNORE_MAXIMIZED makes no sense for DESKTOP !!!!!! BIG BIG BIG TODO */

            if ( this.options.ignoreMenus ) {
            } else {
                this._signals.push(global.window_manager.connect('map', Lang.bind(this, this._onWindowMapped)));
                // on map: listen to its destroy? to avoid double-firing with position-changed when window is destroyed?
                // this._signals.push(global.window_manager.connect('destroy', Lang.bind(this, this._dirtyToonWindows)));

                _onWindowMapped: function( shellwm, winAct ) {
                    /* Filter out windows we're not interested in */
                    let type = winAct.meta_window.get_window_type();
                    

                    /* If window is of interest, listen to its destroy event */
                    winAct.connect('destroy', Lang.bind(this, this._dirtyToonWindows));
                }
            }


        } else {
            /* Wait for grab operation to end before recalculating.
             * If PAUSE, pause during grab operation. If END, run during grab operation.
             * Only requires listening to grab-op-begin and grab-op-end.
             */
            if ( this.options.recalcMode == XPenguins.RECALC.PAUSE ) {
                this._signals.push(global.screen.connect('grab-op-begin', Lang.bind(this, this._grabOpStarted)));
            }
            this._signals.push(global.screen.connect('grab-op-end', Lang.bind(this, this._grabOpEnded)));

            /* Listen to max, unmax, min on the tracker. */
            // TODO: must store source to disconnect properly
            // BIG TODO: do I need to listen to maximize if ignoreMaximized is TRUE ????
            this._signals.push(global.window_manager.connect('maximize', Lang.bind(this, this._dirtyToonWindows)));
            this._signals.push(global.window_manager.connect('unmaximize', Lang.bind(this, this._dirtyToonWindows)));
            this._signals.push(global.window_manager.connect('minimize', Lang.bind(this, this._dirtyToonWindows)));

            /* listen to stacking order change */
            this._signals.push(Shell.Tracker.get_default().connect('notify::focus-app', Lang.bind(this, this._dirtyToonWindows)));

            /* listen to new windows/destroyed windows dirtying the toon windows.
             * If ignoring menus, listen as a workspace event (means switch-workspace too). Hope that focus-app covers unminimize (FIXME).
             * Otherwise, use map/destroy (covers unminimize too)
             */
            if ( this.options.ignoreMenus ) {
                let ws = this.XPenguinsWindow.get_workspace();
                ws._XPenguinsWindowAddedID = ws.connect('window-added', Lang.bind(this, this._dirtyToonWindows));
                ws._XPenguinsWindowRemovedID = ws.connect('window-removed', Lang.bind(this, this._dirtyToonWindows));
                this._signals.push(global.window_manager.connect('switch-workspace', Lang.bind(this, this._onWorkspaceChanged)));
            } else {
                /* BIG TODO: only dirty toon windows if it's on the right workspace & overlapping current! */
                this._signals.push(global.window_manager.connect('map', Lang.bind(this, this._dirtyToonWindows)));
                this._signals.push(global.window_manager.connect('destroy', Lang.bind(this, this._dirtyToonWindows)));
            }
        }
       






        /** Listen to events on the XPenguins Window, only if it's not the desktop **/
        if ( !this.onDesktop ) {
            // TODO: handle double firing
            /* XPenguins window workspace changed */
            this._signals.push( this.XPenguinsWindow.meta_window.connect('workspace-changed', Lang.bind(this, this.onWindowChangesWorkspace)) );
            /* Xpenguins window minimized */ // note: _dirtyToonWindows handles this?
            /* Xpenguins window maximized */
            /* Xpenguins window killed */

        }

        /* When the workspace changes, either pause XPenguins until it changes back,
         * or recalculate windows (depends on this.onAllWorkspaces)
         */

        // Note: if we want to connect to a *workspace*-specific event
        //  (such as window-added or window-removed),
        // might need to listen to notify::n-workspaces too

        // window: position-changed, size-changed, 
        /*
         * Display: window-created, grab-op-begin, grab-op-end
         * Screen: restacked, workspace-added, workspace-removed, workspace-switched, workareas-changed
         *         RESTACKED: stacking order changed. Doesn't appear to be immediate***
         *         WORKAREASCHANGED: nah don't want that.
         * Window: workspace-changed, focus, raise, unmanaged
         *
         * actor.connect('event'): 
         * - key presses
         * - button presses
         * - everything! (don't connect I think - it's too much)
         */
    },

    _onWindowAdded: function( ws, metaWin ) {
        /* Newly-created windows are added to the workspace before
         * the compositor knows about them: get_compositor_private() is null.
         * (see workspace.js _doAddWindow)
         */
        if ( !metaWin.get_compositor_private() ) {
            Mainloop.idle_add(Lang.bind(this, function() {
                        // BIG TODO: need further Lang.bind here?
                        this._connectWindowSignals(metaWin.get_compositor_private());
                        return false; // define as one-time
            }));
        } else {
            this._connectWindowSignals(metaWin.get_compositor_private());
        }
    },

    /* Connect specified window to all signals in this._windowSignals */
    // BIG TODO: when windows are mapped the actor may not exist yet.
    _connectWindowSignals: function( winAct ) {
        if ( !winAct ) {
            this.log('_connectWindowSignals had null winAct');
            return;
        }
        if ( winAct._XPenguinWindowSignals &&
              winAct._XPenguinWindowSignals.length>0 ) {
            /* TODO: already connected, return?? 
             * Or out of date, disconnect?? */
            return;
        }
        winAct._XPenguinWindowSignals = [];
        let i=this._windowSignals.length;
        while ( i-- ) {
            winAct._XPenguinWindowSignals.push(
                    winAct.connect(this._windowSignals[i], Lang.bind(this, this._dirtyToonWindows))
                    );
        }
    },

    /* Disconnect specified window from all signals in this._windowSignals */
    _disconnectWindowSignals: function( winAct ) {
        if ( !winAct ) return;
        if ( !winAct._XPenguinWindowSignals ||
              winAct._XPenguinWindowSignals.length == 0 ) {
                  return;
        }
        let i=winAct._XPenguinWindowSignals.length;
        while ( i-- ) {
            winAct.disconnect(winAct._XPenguinWindowSignals[i]);
        }
        winAct._XPenguinWindowSignals = null;
    },

    _grabOpStarted: function() {
        this.pause();
    },
    _grabOpEnded: function() {
        if ( !this._timeline.is_playing() ) {
            /* unpause if paused (i.e. options.recalcMode == XPenguins.RECALC.PAUSE */
            this.resume(); // already dirties toon windows
        } else {
            this._dirtyToonWindows();
        }
    },

    /* disconnects the events that are listened for */
    this._disconnectSignals: function() {
        let i;
        if ( this._signals ) {
            i=this._signals.length;
            while ( i-- ) {
                // err what do we disconnect *from*? TODO
                global.window_manager.disconnect(this._signals[i]);
            }
            this._signals = [];
        }
        if ( this._windowSignals ) {
            let winList = global.get_window_actors(); // remove from all, even on other workspaces (just in case).
            // FIXME: efficiency: just remove from current workspace?
            i = winList.length;
            while ( i-- ) {
                this._disconnectWindowSignals( winList[i] );
            }
            this._windowSignals = [];
            /* TODO: disconnect workspace listeners */
        }
    },

    // BIG TODO: listen to "our" workspace being destroyed.
    /* Remove the window-added/removed listeners from the old workspace:
     * - add them to the current one (if onAllWorkspaces)
     * - resume (if switched to XPenguinWindow's workspace)
     * - pause (if switched away from XPenguinWindow's workspace)
     * and add them to the current one
     */
    _onWorkspaceChanged: function(shellwm, from, to, direction) {
        // TODO: what happens if you're in god mode?
        /* If you've changed workspaces, you need to change window-added/removed listeners. */
        if ( this.options.onAllWorkspaces ) {
            /* update the toon region */
            this._dirtyToonWindows();
            if ( this.options.recalcMode == XPenguins.RECALC.ALWAYS ) {
                /* disconnect old, reconnect new */
                if ( from._XPenguinsWindowAddedID ) {
                    from.disconnect( from._XPenguinsWindowAddedID );
                    from._XPenguinsWindowAddedID = null;
                }
                to._XPenguinsWindowAddedID = to.connect('window-added', Lang.bind(this, this._onWindowAdded));

                /* Disconnect per-window events on old workspace */
                let winList = from.list_windows();
                let i = winList.length;
                while ( i-- ) {
                    this._disconnectWindowSignals( winList[i].get_compositor_private() );
                }

                /* Reconnect per-window events for new workspace */
                let winList = to.list_windows();
                i = winList.length;
                while ( i-- ) {
                    this._connectWindowSignals( winList[i].get_compositor_private() );
                }
            } else {
                /*  no per-window events. listen to window-added & window-removed for DIRTY */
                /* disconnect old, reconnect new */
                if ( from._XPenguinsWindowAddedID ) {
                    from.disconnect( from._XPenguinsWindowAddedID );
                    from._XPenguinsWindowAddedID = null;
                }
                to._XPenguinsWindowAddedID = to.connect('window-added', Lang.bind(this, this._dirtyToonWindows));
                /* disconnect old, reconnect new */
                if ( from._XPenguinsWindowRemovedID ) {
                    from.disconnect( from._XPenguinsWindowRemovedID );
                    from._XPenguinsWindowRemovedID = null;
                }
                to._XPenguinsWindowRemovedID = to.connect('window-removed', Lang.bind(this, this._dirtyToonWindows));
            }
        } else {
            /* hide the toons & pause if we've switched to another workspace */
            if ( to != this.XPenguinsWindow.get_workspace() ) {
                this.hideToons();
                this.pause();
            } else {
                this.showToons();
                this.resume();
            }
        }
    },


    /* whenever the XPenguins window changes workspace.
     * This may or may not involve the *user* also switching workspaces.
     * Note: *NEVER* connect this up if you're running on the desktop,
     *  global.stage.get_workspace() doesn't work.
     */
    _onWindowChangesWorkspaces: function() {
        if ( this.options.onAllWorkspaces )
            return;
        /* NOTE: assumes this._workspaces is of length at most 1 */
        let i = this._workspaces.length;
        while ( i-- ) {
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowAddedId);
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowRemovedId);
        }

        /* populate with new workspace */
        let ws = this.XPenguinsWindow.get_workspace();
        this._workspaces = [ ws ]; // may not be active one.
        ws._XPenguinsWindowAddedId = ws.connect('window-added', Lang.bind(this, this._dirtyToonWindows));
        ws._XPenguinsWindowRemovedId = ws.connect('window-removed', Lang.bind(this, this._dirtyToonWindows));
    },

    _dirtyToonWindows: function(shellwm, actor) {
        // TODO: how to discover the firing event to log?
        this._toon_windows_dirty = true;
    },

// shell_app_signals (window changed)

    stub: function() {},

    _updateToonWindows: function() {
    },


    /***** GOD MODE ****/
    _onEnableGodMode: function() {
        // BIG TODO:
        // you can connect a window properly up to a button-press-event.
        // *BUT* when you connect the global.stage up it doesn't get the events,
        // even on the desktop window.
        // ** Also ** try on nautilus-managed desktops.
        
        /* listen for clicks on the stage */
        /* NOTE: if you get the global stage you can do global.stage.grab_key_focus()
         * to collect clicks.
         * Otherwise it won't.
         * But *DANGER DANGER*: this disables all other keyboard/mouse clicks, better make sure you
         * have something listening to 'Esc' to exit!
         */
        /* BIG TODO: HOW TO CONNECT THE STAGE; window is fine */
        this._godModeID = this.XPenguinsWindow.connect('button-press-event', this._onSmite);
        /* change cursor to something suitably god-like */
        // FIXME: ICING: change it to a bolt of lightning :D
        global.set_cursor(Shell.Cursor.POINTING_HAND);

    },
    _onSmite: function(actor, event) {
        // Event coordinates are relative to the stage
        // that received the event, and can be transformed
        // into actor-relative coordinates using actor.transform_stage_point()
        // Not in Clutter-gir. button 1 == PRIMARY, 2 == MIDDLE, 3 == SECONDARY
        if ( event.button != 1 ) {
            return;
        }
        let [stageX, stageY] = event.get_coords();
        // note: should sanity check that actor.get_stage() is this.XPenguinsWindow!
        /* This appears to get the top-most actor that has been *added to XPenguinsWindow directly* */
        let act = actor.get_stage().get_actor_at_pos(Clutter.PickMode.ALL, stageX, stageY);
        /* if no toon underneath go away */
        if ( !act || !('toon_object' in act) ) {
            return;
        }

        this.log('SMITE at %i, %i'.format(x,y));

        /* xpenguins_frame() bit in here */
        let toon == act.toon_object;
        let gdata = this._theme.ToonData[toon.genus];
        /* squash if it's not already dead/dying.
         * Gosh, that's a lot of ways for the toons to die, isn't it? 
         */
        if ( toon.type != 'explosion' && toon.type != 'zapped' &&
             toon.type != 'squashed' && toon.type != 'angel' &&
             toon.type != 'splatted' && toon.type != 'exit' &&
             !toon.terminating ) {
            // TODO: I think .x & .y & .width & .height vs _map are to do with the toon being
            // at (x,y) and (width,height) == pixmap, BUT the toon *itself*  is only at (x,y) (?) and (data.width,data.height).
            /* Kill the toon */
            if ( this.options.blood && gdata['zapped'] ) {
                toon.set_type('zapped', toon.direction, Toon.DOWN);
            } else if ( gdata['explosion'] ) {
                toon.set_type('explosion', toon.direction, Toon.HERE);
            } else {
                toon.active = false;
            }
            toon.set_association(Toon.UNASSOCIATED);
        }            
    },

    _onDisableGodMode: function() {
        if ( this._godModeID ) {
            this.XPenguinsWindow.disconnect(this._godModeID);
        }
        /* change cursor back */
        global.unset_cursor();
    },

    /* ToonConfigure, the signals section
     * not needed: listens to SIGINT/SIGTERM/SIGHUP and:
     * - if Toon.CATCHSIGNALS: when signal received, just store in toon_signal
     * - if Toon.EXITGRACEFULLY (set to this when interupt received in main loop
     *   & we wish to signal ending sequence): when signal recieved, disable receiving
     *   further signals & call this.destroy()
     * - if Toon.NOCATCHSIGNALS: doesn't catch any signals.
     * 
     * We don't need this: the user can't Ctrl+C to destroy it, just
     *  use the toggle switch.
     */

    _onChangeIgnorePopups: function(yn) {
        this.options.ignorePopups = yn;
        if ( this._timeline.is_playing() ) {
            //TODO
            //for ( let i=0; i<this._toon_number; ++i ) {
            //  ToonCalculateAssociations
            //  ToonLocateWindows
            //  ToonRelocateAssociated
            //}
        }
    }

    _onInterrupt: function() {
        this.log(_('Interrupt received: Exiting.'));
       
        /* set the 'exit gracefully flag' */ 
        //ToonConfigure(Toon.EXITGRACEFULLY);
        this._exiting = true;
        this.set_number(0);
    },

    /* if ToonWindowsMoved() then this occurs.
     * In xpenguins_frame.
     */
    _onToonWindowsMoved: function() {
        /* check for squashed toons */
        // TODO:
        //ToonCalculateAssociations(penguin, penguin_number);
        //ToonLocateWindows();
        //ToonRelocateAssociated(penguin, penguin_number);
    },
 
   /* for testing: shows a *single* walking toon under no constraints */ 
    _simple_frame: function(timeline, elapsed_time) {
        let i=0;
        let toon = this._penguins[i];

        let sstatus = toon.Advance(Toon.MOVE);
        /* if status != Toon.OK... stuff: don't bother with for now */
        if ( Math.abs(toon.u) < toon.data.terminal_velocity ) {
            if ( toon.direction ) {
                toon.u += toon.data.acceleration;
            } else {
                toon.u -= toon.data.acceleration;
            }
        }
        toon.Draw();

    }, 

    /* _frame is called every frame of the iteration.
     * It consists of two parts:
     *
     * xpenguins_frame()
     * Advances one frame of the xpenguins iteration,
     *  & returns the number of active penguins.
     *  (or the *last* active penguin?!)
     *
     * main loop: controls whether to hibernate,
     * load averaging, etc.
     * main.c
     */
    _frame: function(timeline, elapsed_time) {
        /* NOTE:
         * nPenguins is the full complement of penguins;
         * whereas penguin_number can change if the load gets too high
         */
        /* xpenguins_frame() */
        let sstatus = null;
        let last_active = -1; 
        let o = this.options;
        
        /* Loop through all the toons *
         * NOTE: this.nPenguins is set always and the max. number of penguins to display.
         *       this._toon_number is the number of penguins *currently* active or not terminating,
         *       and can change from loop to loop.
         *       If it's 0, we quit.
         * this.nPenguins    <-> npenguins
         * this._toon_number <-> penguin_number
         */
        for ( let i=0; i<this._toon_number; ++i ) {
            if ( !this._penguins[i].active ) {
                if (!this._penguins[i].terminating) {
                    // it's done terminating and needs to be reborn! :D
                    this._penguins[i].init();
                    last_active = i; 
                }
            }
            /*
            // TODO: else if ( in god mode & you squished a penguin )
            else if (toon_button_x >= 0
                 && type != PENGUIN_EXPLOSION && type != PENGUIN_ZAPPED
                 && type != PENGUIN_SQUASHED && type != PENGUIN_ANGEL
                 && type != PENGUIN_SPLATTED && type != PENGUIN_EXIT
                 && !penguin[i].terminating
                 && toon_button_x > penguin[i].x_map
                 && toon_button_y > penguin[i].y_map
                 && toon_button_x < penguin[i].x_map + penguin[i].width_map
                 && toon_button_y < penguin[i].y_map + penguin[i].height_map) {
                  // Toon has been hit by a button press 
                if (xpenguins_blood && gdata[PENGUIN_ZAPPED].exists) {
                    ToonSetType(penguin+i, PENGUIN_ZAPPED,
                        penguin[i].direction, TOON_DOWN);
                } else if (gdata[PENGUIN_EXPLOSION].exists) {
                    ToonSetType(penguin+i, PENGUIN_EXPLOSION,
                        penguin[i].direction, TOON_HERE);
                } else {
                    penguin[i].active = 0;
                }
                ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
                last_active = i;
            }
            */
            else {
                /* laziness */
                let toon = this._penguins[i];
                let gdata = this._theme.ToonData[toon.genus];
                last_active = i; // TODO: seems to be set to i always?

                // TODO: this.conf
                /* see if the toon is squashed */
                if ( !((this.conf & Toon.NOBLOCK) | (this.conf & Toon.INVULNERABLE))
                        && toon.Blocked(Toon.HERE) ) {
                    if ( o.blood && gdata['squashed'] ) {
                        toon.set_type('squashed', toon.direction, Toon.HERE);
                    } else if ( gdata['explosion'] ) {
                        toon.set_type('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                    toon.set_velocity(0, 0);
                    toon.set_association( Toon.UNASSOCIATED );
                } else { // whether squashed
                    /* move the toon */
                    sstatus = toon.Advance(Toon.MOVE);
                    // switch ( toon.type )
                    if ( toon.type == 'faller' ) {
                        if ( sstatus != Toon.OK ) {
                            /* if it has landed change type appropriately */
                            if ( toon.Blocked(Toon.DOWN) ) {
                                toon.direction = ( toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2) );
                                toon.make_walker(false);
                                toon.pref_direction = -1;
                            } else {
                                /* turn into climber (if exists) or bounce off */
                                if ( !gdata['climber'] || XPUtil.RandInt(2) ) {
                                    toon.set_velocity(-toon.u, gdata['faller'].speed);
                                } else {
                                    toon.direction = (toon.u>0);
                                    toon.make_climber();
                                }
                            }
                            // TODO: data[toon.type] vs toon.data: speedup?
                        } else if (toon.v < toon.data.terminal_velocity) {
                        /* status is OK, accelerate */
                            toon.v += toon.data.acceleration;
                        }
                    }
                    /* tumbler */
                    else if ( toon.type == 'tumbler' ) {
                        if ( sstatus != Toon.OK ) {
                            /* should it splat? (33% chance if reached terminal velocity) */
                            if ( o.blood && gdata['splatted'] &&
                                 toon.v >= toon.data.terminal_velocity &&
                                 !XPUtil.RandInt(3) ) {
                                toon.set_type('splatted', Toon.LEFT, Toon.DOWN);
                                toon.set_association(Toon.DOWN);
                                toon.set_velocity(0, 0);
                            } else {
                                /* got lucky - didn't splat: walk */
                                toon.direction = ( toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2) );
                                toon.make_walker(false);
                                toon.pref_direction = -1;
                            } 
                        } else if ( toon.v < toon.data.terminal_velocity ) {
                            /* toon is OK to move, accelerate */
                            toon.v += toon.data.acceleration;
                        }
                    } 
                    /* walker or runner */
                    else if ( toon.type == 'walker' || toon.type == 'runner' ) {
                        if ( sstatus != Toon.OK ) {
                            if ( sstatus == Toon.BLOCKED ) {
                                /* try to step up... */
                                let u = toon.u;
                                // TODO: PENGUIN_JUMP
                                if ( !toon.OffsetBlocked(u, -PENGUIN_JUMP) ) {
                                    toon.move_by(u, -PENGUIN_JUMP);
                                    toon.set_velocity(0, PENGUIN_JUMP-1);
                                    toon.Advance( Toon.MOVE );
                                    toon.set_velocity( u, 0 );
                                    /* don't forget to accelerate! */
                                    if ( Math.abs(u) < toon.data.terminal_velocity ) {
                                        if ( toon.direction ) {
                                            toon.u +=  toon.data.acceleration;
                                        } else {
                                            toon.u -=  toon.data.acceleration;
                                        }
                                    } else {
                                        /* can't jump! we can turn around,
                                         * fly or climb... */
                                        let n = XPUtil.RandInt(8)*(1-toon.pref_climb);
                                        if ( n < 2 ) {
                                            if ( (n==0 || !gdata['floater']) && gdata['climber'] ) {
                                                toon.make_climber();
                                                //break
                                            } else if ( gdata['floater'] ) {
                                                /* make floater */
                                                let newdir = +!penguin.direction; // coerce to int
                                                toon.set_type('floater', newdir, Toon.DOWN);
                                                toon.set_association( Toon.UNASSOCIATED );
                                                toon.set_velocity( (RandInt(5)+1)*(newdir*2-1),
                                                                   -gdata['floater'].speed );
                                                // break
                                            }
                                        } else {
                                          /* Change direction *after* creating toon to make sure
                                          that a runner doesn't get instantly squashed... */
                                            toon.make_walker(false);
                                            toon.direction = +!toon.direction; //coerce to int
                                            toon.u = -toon.u;
                                        }
                                    }
                                }
                            }
                        } else if ( !toon.Blocked( Toon.DOWN ) ) {
                            /* try to step (tumble/fall) down... */
                            let u = toon.u;
                            toon.set_velocity(0, PENGUIN_JUMP);
                            sstatus = toon.Advance( Toon.MOVE );
                            if ( sstatus == Toon.OK ) {
                                toon.pref_direction = toon.direction;
                                if ( gdata['tumbler'] ) {
                                    toon.set_type('tumbler', toon.direction, Toon.DOWN);
                                    toon.set_assocation( Toon.UNASSOCIATED );
                                    toon.set_velocity( gdata['tumbler'].speed );
                                } else {
                                    toon.make_faller();
                                    toon.u = 0;
                                }
                                toon.pref_climb = false;
                            } else { /* couldn't tumble down */
                                toon.set_velocity(u, 0);
                            } 
                        /* 1/100 chance of becoming actionX */
                        } else if ( gdata['action0'] && !XPUtil.RandInt(100) ) {
                            let action = 1;
                            /* find out how many actions exist */
                            // TODO: store this in ToonData to prevent recalculating *every frame & genus*?
                            while ( gdata['action%i'.format(action)] && ++action ) {};
                            /* pick a random one */
                            action = XPUtil.RandInt(action);
                            let actionN = 'action%i'.format(action);
                            /* If we have enough space, start the action: */
                            if ( !toon.CheckBlocked(actionN, Toon.DOWN) ) {
                                toon.set_type(actionN, toon.direction, Toon.DOWN);
                                toon.set_velocity(gdata[actionN].speed*(2*toon.direction-1), 0);
                            }
                        } else if ( Math.abs(toon.u) < toon.data.terminal_velocity ) {
                        /* otherwise, just keep walking/running & accelerate. */
                            if ( toon.direction )
                                toon.u += toon.data.acceleration;
                            else
                                toon.u -= toon.data.acceleration;
                        }
                    }
                    /* a toon engaged in an action */
                    else if ( toon.type.match(/^action[0-9]+$/) ) {
                        if ( sstatus != Toon.OK ) {
                            let u = toon.u;
                            if ( !toon.OffsetBlocked(u, -PENGUIN_JUMP) ) {
                                /* try to drift up */
                                toon.move_by(u, -PENGUIN_JUMP);
                                toon.set_velocity(0, PENGUIN_JUMP-1);
                                toon.Advance(Toon.MOVE);
                                toon.set_velocity(u, 0);
                            } else {
                                /* blocked! Turn back into a walker */
                                toon.make_walker(false);
                            }
                        } else if ( !toon.Blocked(Toon.DOWN) ) {
                            /* space below, drift down (tumble or fall) */
                            toon.set_velocity(0, PENGUIN_JUMP);
                            sstatus = toon.Advance(Toon.MOVE);
                            if ( sstatus == Toon.OK ) {
                                if ( gdata['tumbler'] ) {
                                    toon.set_type('tumbler', toon.direction, Toon.DOWN);
                                    toon.set_association(Toon.UNASSOCIATED);
                                    toon.set_velocity(0, gdata['tumbler'].speed);
                                } else {
                                    toon.make_faller();
                                }
                                toon.pref_climb = false;
                            } else {
                                /* can't drift down, go sideways */
                                toon.set_velocity(toon.data.speed*(2*toon.direction-1), 0);
                            }
                        } else if ( toon.frame == 0 ) {
                            /* continue the action, or if you're finished loop/turn into walker */
                            let loop = toon.data.loop;
                            if (!loop)
                                loop = -10;
                            if ( loop < 0 ) {
                                if ( !XPUtil.RandInt(-loop) ) {
                                    toon.make_walker(false);
                                }
                            } else if ( penguin.cycle >= loop ) {
                                toon.make_walker(false);
                            }
                        }
                    }
                    /* climber */
                    else if ( toon.type == 'climber' ) {
                        let direction = toon.direction;
                        if ( toon.y < 0 ) {
                            /* reached top of screen, fall down */
                            // BIG TODO: how does y work in clutter?
                            // in xpenguins it's inverted (y==0 is top)
                            toon.direction = +!direction;
                            toon.make_faller();
                            toon.pref_climb = false;
                        } else if ( sstatus == Toon.BLOCKED ) {
                            /* try to step out... */
                            let v = toon.v;
                            let xoffset = (1-direction*2)*PENGUIN_JUMP;
                            if ( !toon.OffsetBlocked(xoffset, v) ) {
                                toon.move_by(xoffset, v);
                                toon.set_velocity(-xoffset-(1-direction*2), 0);
                                toon.Advance( Toon.MOVE );
                                toon.set_velocity(0, v);
                            } else {
                                toon.direction = +!direction;
                                toon.make_faller();
                                toon.pref_climb = false;
                            }
                        } else if ( !toon.Blocked(direction) ) {
                            /* reached the top, start walking */
                            if ( toon.OffsetBlocked((2*direction-1)*PENGUIN_JUMP, 0) ) {
                                toon.set_velocity((2*direction-1)*(PENGUIN_JUMP-1), 0);
                                toon.Advance(Toon.MOVE);
                                toon.set_velocity(0, -toon.data.speed);
                            } else {
                                toon.make_walker(true);
                                toon.move_by(2*direction-1, 0);
                                toon.pref_direction = direction;
                                toon.pref_climb = true;
                            }
                        } else if (toon.v > -toon.data.terminal_velocity) {
                            /* slow down */
                            toon.v -= toon.data.acceleration;
                        }
                    }
                    /* floater */
                    else if ( toon.type == 'floater' ) {
                        if ( toon.y < 0 ) {
                            toon.direction = +(toon.u>0);
                            toon.make_faller();
                        } else if ( sstatus != Toon.OK ) {
                            if ( toon.Blocked(Toon.UP) ) {
                                toon.direction = +(toon.u>0);
                                toon.make_faller();
                            } else {
                                toon.direction = +!toon.direction;
                                toon.set_velocity(-toon.u, -toon.data.speed);
                            }
                        }
                    } 
                    /* explosion */
                    else if ( toon.type == 'explosion' ) {
                        /* turn into angel */
                        if ( o.angels && !toon.terminating &&
                             gdata['angel'] ) {
                            toon.set_type('angel', toon.direction, Toon.HERE);
                            toon.set_velocity(XPUtil.RandInt(5)-2, -gdata['angel'].speed);
                            toon.set_association(Toon.UNASSOCIATED);
                             }
                    }
                    /* angel */
                    else if ( toon.type == 'angel' ) {
                        /* deactivate if offscreen */
                        if ( toon.y < -toon.data.height ) {
                            toon.active = 0;
                        }
                        if ( sstatus != Toon.OK ) {
                            toon.u = -toon.u;
                        }
                    } // switch( toon.type )
                } // whether sqashed
            } // toon state

            // BIGTODO: erase not needed (?)
            /* draw all the penguins. */
            toon[i].Draw();

            /* store the number of active/non-terminating penguins */
            this._toon_number = last_active + 1;
        } // penguin loop
        // TODO: ToonFLush == XFLush(toon_display)
        /************* END xpenguins_frame() ************/


        /************* START main loop ************/
        /* If there are no toons left & 'exiting' has been signalled,
         * then we've just finished killing all the penguins.
         */
        if ( !this._toon_number && this._exiting ) {
            this.log(_('Done.'));
            this.exit(); // TODO: stop timeline.
            return;
        }
        if ( this._exiting ) {
            this.log('.');
        }

        // TODO: timeline.get_current_repeat() could be this.cycle,
        // if only there were one frame per repeat?

        // small todo: code cleanup. all the this. & this._ & o
        /* check the CPU loading */
        if ( !this._exiting && this._cycle > o.load_cycles &&
                o.load1 >= 0 ) {
            let load = XPUtil.loadAverage();
            let newp;
            if ( o.load2 > o.load1 ) {
                newp = Math.round(((o.load2-load)*o.nPenguins)/(o.load2-o.load1));
                newp = Math.min( o.nPenguins, Math.max( 0, newp ) );
            } else if ( load < o.load1 ) {
                newp = o.nPenguins;
            } else {
                newp = 0;
            }
            if ( o.nPenguins != newp ) {
                this.set_number(newp);
            }
            this.log(_('Adjusting number according to load'));
            this._cycle = 0;
        } else if ( !(this._toon_number) ) { 
            /* No penguins active, but not exiting either.
             * Hibernate for 5 seconds...
             */
            this._cycle = o.load_cycles;

            // TODO: pause timer for specified time.
            this.pause();
            this._sleepID = Mainloop.timeout_add(o.load_check_interval,
                    Lang.bind(this, function() { 
                        this.resume(); 
                        return false;  // return false to call just once.
                    }));
        }
        ++this._cycle;
        // TODO: set this to run again in o.sleep_msec? or trust to the timeline?
    }, // _frame

    set_number: function(n) {
        if ( !this._timeline.is_playing() )  {
            this._toon_number = n;
            return;
        }
        // want to spawn more penguins
        if ( n > this._toon_number ) {
            n = Math.min(PENGUIN_MAX, n);
            for ( let i=this._toon_number; i<n; i++ ) {
                this._penguins[i].init(); // what if genus isn't set?
                this._penguins[i].active = true;
            }
            this._toon_number = n;
        } else if (n < this._toon_number) {
            /* there are some active penguins that have to be killed */
            n = Math.max(n, 0);
            for (let i = n; i < this._toon_number; ++i) {
                if ( this._penguins[i].active ) {
                    let toon = this._penguins[i];
                    let gdata = this._theme.ToonData[toon.genus];
                    if ( this.options.blood && gdata['exit'] ) {
                        toon.set_type('exit', toon.direction, Toon.DOWN);
                    } else if ( gdata['explosion'] ) {
                        toon.set_type('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = 0;
                    }
                }
                // regardless, set it terminating.
                this.penguins[i].terminating = true;
            }
            this._penguins[i].Draw();
        }
    },

    /***** DEPRECIATED *****/
    /* Whenever the number of workspaces is changed,
     * listen to an 'add window' event in case it starts
     * maximised.
     */
    _onChangeNWorkspaces: function() {
        if ( !this.options.onAllWorkspaces )
            return;

        let i,ws;
        i = this._workspaces.length;
        while ( i-- ) {
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowAddedId);
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowRemovedId);
        }

        this._workspaces = [];
        i = global.screen.n_workspaces;
        while ( i-- ) {
            ws = global.screen.get_workspace_by_index(i);
            this._workspaces.push(ws);
            ws._XPenguinsWindowAddedId = ws.connect('window-added', Lang.bind(this, this._dirtyToonWindows));
            ws._XPenguinsWindowRemovedId = ws.connect('window-removed', Lang.bind(this, this._dirtyToonWindows));
        }
    },

};
