const Clutter = imports.gi.Clutter;

const Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const XPUtil = Extension.util; 
const Toon   = Extension.toon.Toon;
const Theme  = Extension.theme.Theme;
const Region = Extension.region;


/************************
 * X penguins main loop *
 ************************/
function XPenguinsLoop() {
    this._init.apply(this, arguments);
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
        /* Ignore popup windows [FIXME:  not implemented]*/
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
        /* temporarily disconnect events */
        this._disconnectWindowEvents();
    }

    /* resumes timeline, connects up events */
    resume: function() {
        if ( this._timeline.is_playing() )
            return;
        /* resume timeline */
        this._timeline.start();
        /* reconnect events */
        this._connectWindowEvents();
    }

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
        this._disconnectWindowEvents();

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

        /* Set the number of penguins */
        if ( opt.nPenguins >= 0 ) {
            this.set_number(opt.nPenguins); 
            // same as this._toon_number = opt.nPenguins;
        }

        /* See if load averaging will work */ 
        if ( opt.load1 >= 0 ) {
            let load = XPUtil.loadAverage();
            if ( load < 0 ) {
                opt.log(_("Warning: cannot detect load averages on this system"));
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

        /* set up god mode */
        if ( opt.squish ) {
            this._onEnableGodMode();
        }

        /* set up toon_windows */
        this._toon_windows = new Region.Region();
        this._updateToonWindows();


        /* set up global vars to feed in to the toons */
        this._stage = global.stage;
        if ( opt.workspace >= 0 ) {
            opt.workspace = global.screen.get_active_workspace();
        }
        this.global = {
            XPenguinsStageWidth: global.get_width(),
            XPenguinsStageHeight: global.get_width(),
            ToonData: this._theme.ToonData,
            //options: opt, // <-- do I really want to lug the *whole* structure around?!
            edge_block: opt.edge_block,
            toon_windows: this._toon_windows, // NOTE: if I update it externally will the pointer update?
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
        for ( let i=0; i<genus_numbers.length; ++i ) {
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

        this._connectSignalEvents();
        this._signals = [];

        /****************************************/
        //windows-changed
        //NOTE: it might be easier to just recalculate

        /* When the number of workspaces is changed, update listeners */
        this._signals.push(global.screen.connect('notify::n-workspaces', Lang.bind(this, this.stub)));
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
    _connectWindowEvents: function() {
        /* when windows are added, removed, maximise, unmaximise, minimise: recalculate. */
        // TODO: trying to replace workspace::window-added and window-removed with map/destroy.
        this._signals.push(global.window_manager.connect('maximize', Lang.bind(this, this._dirtyToonWindows)));
        this._signals.push(global.window_manager.connect('unmaximize', Lang.bind(this, this._dirtyToonWindows)));
        this._signals.push(global.window_manager.connect('minimize', Lang.bind(this, this._dirtyToonWindows)));
        this._signals.push(global.window_manager.connect('map', Lang.bind(this, this._dirtyToonWindows)));
        this._signals.push(global.window_manager.connect('destroy', Lang.bind(this, this._dirtyToonWindows)));
        // TODO: more efficient to only listen on the xpenguins workspace?
        /* NOTES: 
         * new window, unminimize => map 
         * close window => destroy
         * maximize   => maximize
         * unmaximize => unmaximize
         * **Includes file menus and message tray**
         *
         * SUMMARY:
         * use windowtracker. map/destroy to include message tray + popup menus
         * use workspace. window-added window-removed to just add windows (including popups).
         */

        /* When the workspace changes, either pause XPenguins until it changes back,
         * or recalculate windows (depends on this.onAllWorkspaces)
         */
        this._signals.push(global.window_manager.connect('switch-workspace', Lang.bind(this, this._onWorkspaceChanged)));

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
         */
    },

    /* disconnects the events that are listened for */
    this._disconnectWindowEvents: function() {
        if ( this._signals ) {
            let i=this._signals.length;
            while ( i-- ) {
                // err what do we disconnect *from*? TODO
                global.window_manager.disconnect(this._signals[i]);
            }
            this._signals = [];
        }
    },

    // BIG TODO: listen to "our" workspace being destroyed.
    // Note: 'Desktop' window workspace is -1.
    _onWorkspaceChanged: function() {
        // TODO: what happens if you're in god mode?
        if ( this.onAllWorkspaces ) {
            this._dirtyToonWindows();
        } else {
            // TODO: workspace vs workspace index
            if ( global.screen.get_active_workspace() == THIS.WORKSPACE ) {
                /* resume & reconnect */
                this.resume();
            } else {
                /* pause & temporarily disconnect */
                this.pause();
            }
        }
    },

    _dirtyToonWindows: function(shellwm, actor) {
        // TODO: how to discover the firing event to log?
        this._toon_windows_dirty = true;
    },

    /* Whenever the number of workspaces is changed,
     * listen to an 'add window' event in case it starts
     * maximised.
     */
    _onChangeNWorkspaces: function() {
        // what if #workspaces *decreases* - do we still have to disconnect?
        if ( this.options.workspace == -1 ) {
            let i=global.screen.n_workspaces;
            let ws;
            while ( i-- ) {
                let ws = global.screen.get_workspace_by_index(i);
                if ( !ws._XPenguinsWindowAddedId ) {
                    ws._XPenguinsWindowAddedId = ws.connect('window-added', Lang.bind(this, this.stub));
                }
            }
        } else {
            // store a *workspace* in this.options.workspace.? (otherwise what if the index changes?)
            ws._XPenguinsWindowAddedId = ws.connect('window-added', Lang.bind(this, this.stub));
            // TODO: what if the xpenguins workspace was deleted?
        }
    }
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
        // note: should sanity check that actor.get_stage() is this.XPenguinsStage!
        /* This appears to get the top-most actor that has been *added to XPenguinsStage directly* */
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

};
