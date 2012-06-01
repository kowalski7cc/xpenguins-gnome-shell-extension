/*
 * [yep] _onInterrupt
 * [yep] jumping penguins
 * UPTO:
 * all the TODOs (wid, window data, ...) --> move windows & see if toons cling on.
 * * exploded penguins do not turn into angels until you remove what exploded them ('toon changing from explosion to explosion')
 * sometimes: fatal IO error 11 Resource temporarily unavailable.
 * god mode
 * speed up (seems to lag the computer, perhaps because of Mainloop)
 * on-the-fly settings changes
 * multiple themes
 * Recalc modes
 * load averaging
 * on all workspaces
 * - test w/ nautilus desktop window
 * - treat the top activities bar as solid?
 * - test w/ gnome-panel
 * - test w/ autohiding stuff
 * - test w/ frippery bottom panel/dock/etc
 * ** dual-mon - how to avoid toons going into bad area of stage?
 *
 */
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const XPUtil = Me.util;
const Toon   = Me.toon.Toon;
const Theme  = Me.theme.Theme;
const Region = Me.region;
const WindowListener = Me.windowListener.WindowListener.prototype; // this is how we'll keep it in sync for now.
/* Far away todos:
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

const PENGUIN_MAX = 255;
const PENGUIN_JUMP = 8;
/************************
 * X penguins main loop *
 ************************/
function XPenguinsLoop() {
    this._init.apply(this, arguments);
}

/* When to recalculate window position/size changes.
 * ALWAYS: always (even during the resize/move)
 * PAUSE : pause until resize/move has finished, then recalc at the end.
 * END   : run while resize/move is in progress, but only recalculate at the end. (So toons could walk off-window).
 */
const RECALC = {
    ALWAYS: 0,
    PAUSE : 1,
    END   : 2
};

XPenguinsLoop.prototype = {
    log: function () {
        if (this.options.DEBUG) {
            XPUtil.LOG.apply(this, arguments);

            // make popup
            /*
            let label = new St.Label({text: msg, style_class: 'modal-dialog'});
            global.stage.add_actor(label);
            let monitor = Main.layoutManager.primaryMonitor;
            label.set_position(Math.floor (monitor.width / 2 - label.width / 2), Math.floor(monitor.height / 2 - label.height / 2));
            Mainloop.timeout_add(1000, function () { label.destroy(); return false; });
            */
        }
    },

    warn: function (msg) {
        global.log(msg);
        print(msg);
        log(msg);
    },

    /* options:
     * DEBUG
     * PENGUIN_MAX
     * ignore maximised windows
     * npenguins
     */
    defaultOptions: function () {
        return {
            DEBUG: true,

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
            load_cycles: 0, /* number of frames between load average checks */
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
            //workspace: 0, // -1: always on visible. Otherwise, index of workspace.
            onAllWorkspaces: false, // uhh... this works best with XPenguinsLoop.
            onDesktop: true, /* whether it's running on the desktop or in a window */

            recalcMode: RECALC.ALWAYS,



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
        };
    },

    is_playing: function () {
        return (this._timeline && this._timeline.is_playing());
    },

        // TODO: if xpenguins_active then do something.
    set_themes: function (themeList, setnPenguins) {
        this.log('[XP] set_themes');
        this.options.themes = themeList;

        /* Load theme into this._theme */
        this._theme = new Theme.Theme(this.options.themes);
        if (setnPenguins || this.options.nPenguins < 0) {
            this.options.nPenguins = this._theme.total;
        }
    },

    _init: function (i_options) {

        /* set options */
        let options = this.defaultOptions();
        /* copy over custom options */
        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && options.hasOwnProperty(opt)) {
                options[opt] = i_options[opt];
            } else {
                this.warn('Warning: unknown option %s, ignoring'.format(opt));
            }
        }
        this.options = options;

    },


    _initToons: function () {
        this.log('[XP] _initToons');
        /* set up global vars to feed in to the toons */
        // TODO
        let GLOBAL = {
            XPenguinsWindow: this.XPenguinsWindow,
            ToonData: this._theme.ToonData,
            //options: opt, // <-- do I really want to lug the *whole* structure around?!
            edge_block: this.options.edge_block,
            toon_windows: this.toon_windows,
            // TODO: must change when window changes workspace!
            //workspace: this.options.workspace
        },
        /* set the genus of each penguin, respecting the ratios in theme.number? */
        /* Xpenguins makes one of each type, & then give the requested number
         * per genus, so if your genus is at the end and you run out of penguins,
         * then you miss out on all but one.
         * Also initialise them.
         */
            genus_numbers = this._theme.number.map(Lang.bind(this,
                function (i) {
                    return Math.floor(i / this._theme.total * this.options.nPenguins);
                })),
            i,
            leftover = this.options.nPenguins - genus_numbers.reduce(function (x, y) { return x + y; }); // note: guaranteed <= theme.ngenera
        while (leftover) { // genera 0 to leftover-1 get 1 extra.
            genus_numbers[--leftover] += 1;
        }
        //this.log(('this.options.nPenguins: ' + this.options.nPenguins + ' splitup:' + JSON.stringify(genus_numbers)));
        for (i = 0; i < genus_numbers.length; ++i) {
            while (genus_numbers[i]--) {
                /* Initialise toons */
                // will call .init() automatically since genus is provided.
                this._toons.push(new Toon.Toon(GLOBAL, {genus: i}));
            }
        }

        /* set the stage */
        // TODO: other windows. Want the stage + the window actor?
        // You can set actor == stage if it's a window: add_actor works.
        // *HOWEVER* adding a rectangel to (0, 0) of a window appears to set it a bit outside its bounds.
        i = this._theme.ToonData.length;
        /* add ToonDatas to the stage so clones can be added properly */
        while (i--) {
            for (let type in this._theme.ToonData[i]) {
                if (this._theme.ToonData[i].hasOwnProperty(type) && !this._theme.ToonData[i][type].master) {
                    /* to fix "Attempting to add actor of type '...' to a container of type '...',
                     * but the actor already has a parent of type '...'.
                     */
                    //this.log('adding genus %d type %s', i, type);
                    this.XPenguinsWindow.add_actor(this._theme.ToonData[i][type].texture);
                    this._theme.ToonData[i][type].texture.hide();
                }
            }
        }
        /* add toons to the stage */
        i = this._toons.length;
        this.log('this._toons.length: %d; this.nPenguins: %d; this._toon_number: %d', i, this.options.nPenguins, this._toon_number);
        while (i--) {
            //this.log('adding toon %d', i);
            this.XPenguinsWindow.add_actor(this._toons[i].actor);
            //this._toons[i].Draw();
        }
    },

    /******************
     * START STOP ETC *
     * ****************/
    /* when you send the stop signal to xpenguins (through the toggle) */
    stop: function () {
        this.log('STOP');
        this._onInterrupt();
    },

    /* when you really want to kill xpenguins
     * (ie exit sequence has finished)
     * xpenguins_exit()
     * TODO: Why not 'stop' ?
     */
    exit: function () {
        WindowListener.exit.apply(this, arguments);
    },

    /* start the main xpenguins loop: main.c
     * init() should have been called by now.
     */
    start: function () {
        WindowListener.start.apply(this, arguments);
        //@@ Mainloop...
        this._frame();
    },

    /* pauses the timeline & temporarily stops listening for events,
     * *except* for owner.connect(eventName) which sends the resume signal.
     */
    pause: function () { WindowListener.pause.apply(this, arguments); },

    /* resumes timeline, connects up events */
    resume: function () { WindowListener.resume.apply(this, arguments); },

    /* ToonFinishUp in toon_end.c
     */
    clean_up: function () {
        this.log('[XP] clean_up');
        let i;

        /* stop timeline if it's running */
        if (this._timeline.is_playing()) {
            this._timeline.stop();
        }

        /* @@ mainloop */
        if (this._timelineID) {
            Mainloop.source_remove(this._timelineID);
        }

        /* disconnect events */
        this._disconnectSignals();
        if (this._sleepID) {
            Mainloop.source_remove(this._sleepID);
        }

        /* remove god mode */
        if (this.options.squish || this._godModeID) {
            this._onDisableGodMode();
        }

        /* remove toonDatas from the stage */
        i = this._theme.ToonData.length;
        while (i--) {
            for (let type in this._theme.ToonData[i]) {
                if (this._theme.ToonData[i].hasOwnProperty(type) && !this._theme.ToonData[i][type].master) {
                    this.XPenguinsWindow.remove_actor(this._theme.ToonData[i][type].texture);
                }
            }
        }

        /* remove toons from stage & destroy */
        i = this._toons.length;
        while (i--) {
            this.XPenguinsWindow.remove_actor(this._toons[i].actor);
            this._toons[i].destroy();
        }

        /* destroy theme */
        if (this._theme) {
            this._theme.destroy();
            this._theme = null;
        }

    },

    /* Initialise all variables & load themes & initialise toons.
     * Stuff that has to get reset whenever the timeline restarts.
     * should be called before start()
     * xpenguins_start
     */
    init: function () {
        this.log('[XP] init');

        /* signals */
        this._sleepID = null;
        this._resumeSignal = {}; /* when you pause you have to listen for an event to unpause; use this._resumeID to store this. */

        /* variables */
        //this._theme = null;
        this._toons = [];
        /* The number of penguins that are active or not terminating.
         * When 0, we can call xpenguins_exit()
         */
        this._timeline = null;
        this._toon_number = 0;
        this._cycle = 0;
        this._tempFRAMENUMBER = 0;
        this._exiting = false;
        this.XPenguinsWindow = null;

        this.dirty = true;
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */


        /* Laziness (can do with(this.options) { ... } too) */
        let opt = this.options;
        /* If they set onAllWorkspaces but are running in a window,
         * unset onAllWorkspaces
         * TODO: what if window is 'always on visible workspace'? --> connect window's workspace-changed
         */
        if (opt.onAllWorkspaces && !opt.onDesktop) {
            this.log(_('Warning: onAllWorkspaces is TRUE but running in a window, setting onAllWorkspaces to FALSE'));
            opt.onAllWorkspaces = false;
        }

        /* create timeline */
        /* NOTE: GNOME 3.2 has Clutter-1.0, and no set_repeat_count.
         * --> do timeline.set_loop(true);
         * in GNOME 3.4, use timeline.set_repeat_count(...);
         * Clutter.threads_add_timeout
         */
        this._timeline = new Clutter.Timeline();
        this._timeline.set_loop(true);
        //this._timeline.connect('new-frame', Lang.bind(this, this._frame));

        /* Set the number of penguins */
        if (opt.nPenguins >= 0) {
            this.set_number(opt.nPenguins);
            // same as this._toon_number = opt.nPenguins;
        }

        /* See if load averaging will work */
        if (opt.load1 >= 0) {
            let load = XPUtil.loadAverage();
            if (load < 0) {
                this.log(_("Warning: cannot detect load averages on this system"));
                opt.load1 = -1;
                opt.load2 = -1;
            } else {
                opt.load_cycles = opt.load_check_interval / opt.sleep_msec;
            }
        }

        /* Load theme into this._theme, if not already done */
        if (!this._theme) {
            this.set_themes(opt.themes);
        }

        /* theme-specific options */
        if (!opt.sleep_msec) {
            opt.sleep_msec = this._theme.delay;
        }
        this._timeline.set_duration(opt.sleep_msec); // ??
        // BIGTODO: I ONLY WANT *ONE FRAME* PER TIMELINE?

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
        // NOTE: XPenguinsWindow is the *actor*.

        if (opt.onDesktop) {
            /* Treat them all as a Clutter.Group.
             * You could also do global.stage.get_nth_child[0] for the window clutter group
             */
            this.XPenguinsWindow = global.stage;
            let tmp = this.options.onAllWorkspaces;
            this.options.onAllWorkspaces = null;
            /* do appropriate config for onAllWorkspaces */
            this.changeOption('onAllWorkspaces', tmp);
        } else {
            // TODO: specify somehow.
            this.log('WINDOWED MODE: not yet implemented');
        }

        /* set up god mode */
        if (opt.squish) {
            this._onEnableGodMode();
        }

        /* set up toon_windows */
        this.toon_windows = new Region.Region();

        /* set up toons */
        this._initToons();

        /* Connect signals */
        this._connectSignals();

        this._updateToonWindows();
    },

    changeOption: function () {
        WindowListener.changeOption.apply(this, arguments);
        this._dirtyToonWindows('changeOption');
    },

    /***** Signals ****/
    // Could do XPenguinsLoop.[functionname] = Lang.bind(this, WindowListener.WindowListener.prototype.[functionname])
    // OR
    // WindowListener.WindowListener.prototype.[functionname].apply(this, arguments)
    // and then add extra XPenguinsLoop-specific stuff.
    /* connects up events required to maintain toon_windows as an accurate
     * snapshot of what the windows on the workspace look like
     */
     /*
      * Everyone:
      * RESTACKING: either notify::focus-app (but happens twice per focus) OR {for each win: "raised"}
      * NEW WINDOWS/DESTROYED WINDOWS:
      *   IGNORE POPUPS: window-added and window-removed    for dirtying toon windows
      *  !IGNORE POPUPS: mapped       and destroyed         for dirtying toon windows
      *                  (mapped covers tooltips, right click, ...)
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
    _connectSignals: function () { WindowListener._connectSignals.apply(this, arguments); },
    _disconnectSignals: function () { WindowListener._disconnectSignals.apply(this, arguments); },
    _updateSignals: function () { WindowListener._updateSignals.apply(this, arguments); },
    _onWindowAdded: function () { WindowListener._onWindowAdded.apply(this, arguments); },
    _onWindowRemoved: function () { WindowListener._onWindowRemoved.apply(this, arguments); },
    _onWorkspaceChanged: function () { WindowListener._onWorkspaceChanged.apply(this, arguments); },

    /* whenever the XPenguins window changes workspace.
     * This may or may not involve the *user* also switching workspaces.
     * Note: *NEVER* connect this up if you're running on the desktop,
     *  global.stage.get_workspace() doesn't work.
     */
    _onWindowChangesWorkspaces: function () {
        if (this.options.onAllWorkspaces) {
            return;
        }
        /* NOTE: assumes this._workspaces is of length at most 1 */
        let i = this._workspaces.length;
        while (i--) {
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowAddedId);
            this._workspaces[i].disconnect(this._workspaces[i]._XPenguinsWindowRemovedId);
        }

        /* populate with new workspace */
        let ws = this.XPenguinsWindow.get_workspace();
        this._workspaces = [ ws ]; // may not be active one.
        ws._XPenguinsWindowAddedId = ws.connect('window-added', Lang.bind(this, this._dirtyToonWindows));
        ws._XPenguinsWindowRemovedId = ws.connect('window-removed', Lang.bind(this, this._dirtyToonWindows));
    },

    /********** TOON WINDOWS **************/

    _dirtyToonWindows: function (msg) {
        // hmm, in debugging mode I'd also like to track why.
        this.log('[XP] _dirtyToonWindows %s', msg);
        this.dirty = true;
    },

    _updateToonWindows: function () {
        this.log(('[XP] _updateToonWindows. dirty: ' + this.dirty));
        WindowListener._updateToonWindows.apply(this, arguments);
        this.dirty = false;
    },

    /**************** GOD MODE **************/
    _onEnableGodMode: function () {
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
    _onSmite: function (actor, event) {
        // Event coordinates are relative to the stage
        // that received the event, and can be transformed
        // into actor-relative coordinates using actor.transform_stage_point()
        // Not in Clutter-gir. button 1 == PRIMARY, 2 == MIDDLE, 3 == SECONDARY
        if (event.button !== 1) {
            return;
        }
        let stageX = event.get_coords(),
            stageY,
            act = actor.get_stage().get_actor_at_pos(Clutter.PickMode.ALL, stageX, stageY);

        stageY = stageX[1];
        stageX = stageX[0];
        // note: should sanity check that actor.get_stage() is this.XPenguinsWindow!
        /* This appears to get the top-most actor that has been *added to XPenguinsWindow directly* */
        /* if no toon underneath go away */
        if (!act || !act.hasOwnProperty('toon_object')) {
            return;
        }

        this.log('SMITE at %d, %d'.format(stageX, stageY));

        /* xpenguins_frame() bit in here */
        let toon = act.toon_object,
            gdata = this._theme.ToonData[toon.genus];
        /* squash if it's not already dead/dying.
         * Gosh, that's a lot of ways for the toons to die, isn't it?
         */
        if (toon.type !== 'explosion' && toon.type !== 'zapped' &&
                toon.type !== 'squashed' && toon.type !== 'angel' &&
                toon.type !== 'splatted' && toon.type !== 'exit' &&
                !toon.terminating) {
            // TODO: I think .x & .y & .width & .height vs _map are to do with the toon being
            // at (x, y) and (width, height) == pixmap, BUT the toon *itself*  is only at (x, y) (?) and (data.width, data.height).
            /* Kill the toon */
            if (this.options.blood && gdata.zapped) {
                toon.set_type('zapped', toon.direction, Toon.DOWN);
            } else if (gdata.explosion) {
                toon.set_type('explosion', toon.direction, Toon.HERE);
            } else {
                toon.active = false;
            }
            toon.set_association(Toon.UNASSOCIATED);
        }
    },

    _onDisableGodMode: function () {
        if (this._godModeID) {
            this.XPenguinsWindow.disconnect(this._godModeID);
        }
        /* change cursor back */
        global.unset_cursor();
    },

    /* stop xpenguins, but play the exit sequence */
    _onInterrupt: function () {
        this.log(_('Interrupt received: Exiting.'));

        /* set the 'exit gracefully flag' */
        //ToonConfigure(Toon.EXITGRACEFULLY);
        this._exiting = true;
        this.set_number(0);

        //@@ temp
        //this.exit();
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
    _frame: function () {
        ++this._tempFRAMENUMBER;
        log('FRAME ' + this._tempFRAMENUMBER + ' _toon_number: ' + this._toon_number);

        /* xpenguins_frame() */
        let sstatus = null,
            last_active = -1,
            o = this.options;

        /* Check if events were received & we need to update toon_windows */
        if (this.dirty) {
            // TODO: somehow eliminate so many loops?
            let i = this._toon_number;
            /* calculate for squashed toons */
            while (i--) {
                this._toons[i].CalculateAssociations();
            }
            this._updateToonWindows();
            i = this._toon_number;
            while (i--) {
                this._toons[i].RelocateAssociated();
            }
        }

        /* Loop through all the toons *
         * NOTE: this.nPenguins is set always and the max. number of penguins to display.
         *       this._toon_number is the number of penguins *currently* active or not terminating,
         *       and can change from loop to loop.
         *       If it's 0, we quit.
         * this.nPenguins    <-> npenguins
         * this._toon_number <-> penguin_number
         */

        for (let i = 0; i < this._toon_number; ++i) {
            let toon = this._toons[i];
            /*
            this.log('toon %d: genus: %d, type: %s, position: %d, %d',
                        i, toon.genus, toon.type, toon.x, toon.y);
            */

            if (!toon.active) {
                if (!toon.terminating) {
                    // it's done terminating and needs to be reborn! :D
                    toon.init();
                    last_active = i;
                }
            /*
            else if (gets squished) { // (rest in _onSmite)
                last_active = i; // <-- TODO
            }
            */
            } else {
                /* laziness */
                let u,
                    gdata = this._theme.ToonData[toon.genus];
                last_active = i; // TODO: seems to be set to i always?

                // TODO: this.conf
                /* see if the toon is squashed */
                if (!((this.conf & Toon.NOBLOCK) | (this.conf & Toon.INVULNERABLE)) &&
                        toon.Blocked(Toon.HERE)) {
                    if (o.blood && gdata.squashed) {
                        toon.set_type('squashed', toon.direction, Toon.HERE);
                        // UPTO: it keeps setting explosion to explosion so I assume it's here.
                        // I guess because it's blocked? test w/ xpenguins
                    } else if (gdata.explosion) {
                        toon.set_type('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                    toon.set_velocity(0, 0);
                    toon.set_association(Toon.UNASSOCIATED);
                } else { // whether squashed
                    /* move the toon */
                    sstatus = toon.Advance(Toon.MOVE);
                    // switch (toon.type)
                    if (toon.type === 'faller') {
                        // sstatus != Toon.OK !!!
                        if (sstatus !== Toon.OK) {
                            /* if it has landed change type appropriately */
                            if (toon.Blocked(Toon.DOWN)) {
                                toon.direction = (toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2));
                                toon.make_walker(false);
                                toon.pref_direction = -1;
                            } else {
                                /* turn into climber (if exists) or bounce off */
                                if (!gdata.climber || XPUtil.RandInt(2)) {
                                    toon.set_velocity(-toon.u, gdata.faller.speed);
                                } else {
                                    toon.direction = +(toon.u > 0);
                                    toon.make_climber();
                                }
                            }
                            // TODO: data[toon.type] vs toon.data: speedup?
                        } else if (toon.v < toon.data.terminal_velocity) {
                        /* status is OK, accelerate */
                            toon.v += toon.data.acceleration;
                        }
                    /* tumbler */
                    } else if (toon.type === 'tumbler') {
                        if (sstatus !== Toon.OK) {
                            /* should it splat? (33% chance if reached terminal velocity) */
                            if (o.blood && gdata.splatted &&
                                    toon.v >= toon.data.terminal_velocity &&
                                    !XPUtil.RandInt(3)) {
                                toon.set_type('splatted', Toon.LEFT, Toon.DOWN);
                                toon.set_association(Toon.DOWN);
                                toon.set_velocity(0, 0);
                            } else {
                                /* got lucky - didn't splat: walk */
                                toon.direction = (toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2));
                                toon.make_walker(false);
                                toon.pref_direction = -1;
                            }
                        } else if (toon.v < toon.data.terminal_velocity) {
                            /* toon is OK to move, accelerate */
                            toon.v += toon.data.acceleration;
                        }
                    /* walker or runner */
                    } else if (toon.type === 'walker' || toon.type === 'runner') {
                        if (sstatus !== Toon.OK) {
                            if (sstatus === Toon.BLOCKED) {
                                /* try to step up... */
                                u = toon.u;
                                // TODO: PENGUIN_JUMP
                                if (!toon.OffsetBlocked(u, -PENGUIN_JUMP)) {
                                    toon.move_by(u, -PENGUIN_JUMP);
                                    toon.set_velocity(0, PENGUIN_JUMP - 1);
                                    toon.Advance(Toon.MOVE);
                                    toon.set_velocity(u, 0);
                                    /* don't forget to accelerate! */
                                    if (Math.abs(u) < toon.data.terminal_velocity) {
                                        if (toon.direction) {
                                            toon.u += toon.data.acceleration;
                                        } else {
                                            toon.u -= toon.data.acceleration;
                                        }
                                    } 
                                } else {
                                    /* can't jump! we can turn around,
                                     * fly or climb... */
                                    let n = XPUtil.RandInt(8) * (1 - toon.pref_climb);
                                    if (n < 2) {
                                        if ((n === 0 || !gdata.floater) && gdata.climber) {
                                            toon.make_climber();
                                            //break
                                        } else if (gdata.floater) {
                                            /* make floater */
                                            let newdir = +!toon.direction; // coerce to int
                                            toon.set_type('floater', newdir, Toon.DOWN);
                                            toon.set_association(Toon.UNASSOCIATED);
                                            toon.set_velocity((XPUtil.RandInt(5) + 1) * (newdir * 2 - 1),
                                                               -gdata.floater.speed);
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
                        } else if (!toon.Blocked(Toon.DOWN)) {
                            /* try to step (tumble/fall) down... */
                            u = toon.u;
                            toon.set_velocity(0, PENGUIN_JUMP);
                            sstatus = toon.Advance(Toon.MOVE);
                            if (sstatus === Toon.OK) {
                                toon.pref_direction = toon.direction;
                                if (gdata.tumbler) {
                                    toon.set_type('tumbler', toon.direction, Toon.DOWN);
                                    toon.set_association(Toon.UNASSOCIATED);
                                    toon.set_velocity(0, gdata.tumbler.speed);
                                } else {
                                    toon.make_faller();
                                    toon.u = 0;
                                }
                                toon.pref_climb = false;
                            } else { /* couldn't tumble down */
                                toon.set_velocity(u, 0);
                            }
                        /* 1/100 chance of becoming actionX */
                        } else if (gdata.action0 && !XPUtil.RandInt(100)) {
                            let action = 1;
                            /* find out how many actions exist */
                            // FIXME: store this in ToonData to prevent recalculating *every frame & genus*?
                            while (gdata['action%d'.format(action)]) {
                                ++action;
                            }
                            /* pick a random one */
                            action = XPUtil.RandInt(action);
                            let actionN = 'action%d'.format(action);
                            /* If we have enough space, start the action: */
                            if (!toon.CheckBlocked(actionN, Toon.DOWN)) {
                                toon.set_type(actionN, toon.direction, Toon.DOWN);
                                toon.set_velocity(gdata[actionN].speed * (2 * toon.direction - 1), 0);
                            }
                        } else if (Math.abs(toon.u) < toon.data.terminal_velocity) {
                        /* otherwise, just keep walking/running & accelerate. */
                            if (toon.direction) {
                                toon.u += toon.data.acceleration;
                            } else {
                                toon.u -= toon.data.acceleration;
                            }
                        }
                    /* a toon engaged in an action */
                    } else if (toon.type.substr(0, 6) === 'action') {
                        if (sstatus !== Toon.OK) {
                            u = toon.u;
                            if (!toon.OffsetBlocked(u, -PENGUIN_JUMP)) {
                                /* try to drift up */
                                toon.move_by(u, -PENGUIN_JUMP);
                                toon.set_velocity(0, PENGUIN_JUMP - 1);
                                toon.Advance(Toon.MOVE);
                                toon.set_velocity(u, 0);
                            } else {
                                /* blocked! Turn back into a walker */
                                toon.make_walker(false);
                            }
                        } else if (!toon.Blocked(Toon.DOWN)) {
                            /* space below, drift down (tumble or fall) */
                            toon.set_velocity(0, PENGUIN_JUMP);
                            sstatus = toon.Advance(Toon.MOVE);
                            if (sstatus === Toon.OK) {
                                if (gdata.tumbler) {
                                    toon.set_type('tumbler', toon.direction, Toon.DOWN);
                                    toon.set_association(Toon.UNASSOCIATED);
                                    toon.set_velocity(0, gdata.tumbler.speed);
                                } else {
                                    toon.make_faller();
                                }
                                toon.pref_climb = false;
                            } else {
                                /* can't drift down, go sideways */
                                toon.set_velocity(toon.data.speed * (2 * toon.direction - 1), 0);
                            }
                        } else if (toon.frame === 0) {
                            /* continue the action, or if you're finished loop/turn into walker */
                            let loop = toon.data.loop;
                            if (!loop) {
                                loop = -10;
                            }
                            if (loop < 0) {
                                if (!XPUtil.RandInt(-loop)) {
                                    toon.make_walker(false);
                                }
                            } else if (toon.cycle >= loop) {
                                toon.make_walker(false);
                            }
                        }
                    /* climber */
                    } else if (toon.type === 'climber') {
                        var direction = toon.direction;
                        if (toon.y < 0) {
                            /* reached top of screen, fall down */
                            // BIG TODO: how does y work in clutter?
                            // in xpenguins it's inverted (y == 0 is top)
                            toon.direction = +!direction;
                            toon.make_faller();
                            toon.pref_climb = false;
                        } else if (sstatus === Toon.BLOCKED) {
                            /* try to step out... */
                            let v = toon.v,
                                xoffset = (1 - direction * 2) * PENGUIN_JUMP;
                            if (!toon.OffsetBlocked(xoffset, v)) {
                                toon.move_by(xoffset, v);
                                toon.set_velocity(-xoffset - (1 - direction * 2), 0);
                                toon.Advance(Toon.MOVE);
                                toon.set_velocity(0, v);
                            } else {
                                toon.direction = +!direction;
                                toon.make_faller();
                                toon.pref_climb = false;
                            }
                        } else if (!toon.Blocked(direction)) {
                            /* reached the top, start walking */
                            if (toon.OffsetBlocked((2 * direction - 1) * PENGUIN_JUMP, 0)) {
                                toon.set_velocity((2 * direction - 1) * (PENGUIN_JUMP - 1), 0);
                                toon.Advance(Toon.MOVE);
                                toon.set_velocity(0, -toon.data.speed);
                            } else {
                                toon.make_walker(true);
                                toon.move_by(2 * direction - 1, 0);
                                toon.pref_direction = direction;
                                toon.pref_climb = true;
                            }
                        } else if (toon.v > -toon.data.terminal_velocity) {
                            /* slow down */
                            toon.v -= toon.data.acceleration;
                        }
                    /* floater */
                    } else if (toon.type === 'floater') {
                        if (toon.y < 0) {
                            toon.direction = +(toon.u > 0);
                            toon.make_faller();
                        } else if (sstatus !== Toon.OK) {
                            if (toon.Blocked(Toon.UP)) {
                                toon.direction = +(toon.u > 0);
                                toon.make_faller();
                            } else {
                                toon.direction = +!toon.direction;
                                toon.set_velocity(-toon.u, -toon.data.speed);
                            }
                        }
                    /* explosion */
                    } else if (toon.type === 'explosion') {
                        // UPTO: they don't always turn into angel straight away and they should.
                        /* turn into angel */
                        if (o.angels && !toon.terminating && gdata.angel) {
                            toon.set_type('angel', toon.direction, Toon.HERE);
                            toon.set_velocity(XPUtil.RandInt(5) - 2, -gdata.angel.speed);
                            toon.set_association(Toon.UNASSOCIATED);
                        }
                    /* angel */
                    } else if (toon.type === 'angel') {
                        /* deactivate if offscreen */
                        if (toon.y < -toon.data.height) {
                            toon.active = 0;
                        }
                        if (sstatus !== Toon.OK) {
                            toon.u = -toon.u;
                        }
                    } // switch(toon.type)
                } // whether sqashed
            } // toon state

            // BIGTODO: erase not needed (?)
            /* draw all the penguins. */
            toon.Draw();

        } // penguin loop
        /* store the number of active/non-terminating penguins */
        this._toon_number = last_active + 1;
        /************* END xpenguins_frame() ************/


        /************* START main loop ************/
        /* If there are no toons left & 'exiting' has been signalled,
         * then we've just finished killing all the penguins.
         */
        if (!this._toon_number && this._exiting) {
            this.log(_('Done.'));
            this.exit(); // TODO: stop timeline.
            return;
        }
        if (this._exiting) {
            this.log('.');
        }

        // TODO: timeline.get_current_repeat() could be this.cycle,
        // if only there were one frame per repeat?

        // small todo: code cleanup. all the this. & this._ & o
        /* check the CPU loading */
        if (!this._exiting && this._cycle > o.load_cycles &&
                o.load1 >= 0) {
            let newp,
                load = XPUtil.loadAverage();
            if (o.load2 > o.load1) {
                newp = Math.round(((o.load2 - load) * o.nPenguins) / (o.load2 - o.load1));
                newp = Math.min(o.nPenguins, Math.max(0, newp));
            } else if (load < o.load1) {
                newp = o.nPenguins;
            } else {
                newp = 0;
            }
            if (o.nPenguins !== newp) {
                this.set_number(newp);
            }
            this.log(_('Adjusting number according to load'));
            this._cycle = 0;
        } else if (!(this._toon_number)) {
            /* No penguins active, but not exiting either.
             * Hibernate for 5 seconds...
             */
            this._cycle = o.load_cycles;

            // TODO: pause timer for specified time.
            this.pause();
            this._sleepID = Mainloop.timeout_add(o.load_check_interval,
                Lang.bind(this, function () {
                    this.resume();
                    return false;  // return false to call just once.
                }));
        }
        ++this._cycle;

        /* add to the next ... */
        this._timelineID = Mainloop.timeout_add(o.sleep_msec,
                Lang.bind(this, this._frame));

        // TODO: set this to run again in o.sleep_msec? or trust to the timeline?
    }, // _frame

    set_number: function (n) {
        if (!this._timeline || !this._timeline.is_playing())  {
            this.options.nPenguins = n;
            this._toon_number = n;
            return;
        }
        // want to spawn more penguins
        if (n > this._toon_number) {
            n = Math.min(PENGUIN_MAX, n);
            for (let i = this._toon_number; i < n; i++) {
                this._toons[i].init(); // what if genus isn't set?
                this._toons[i].active = true;
            }
            this._toon_number = n;
        } else if (n < this._toon_number) {
            /* there are some active penguins that have to be killed */
            n = Math.max(n, 0);
            for (let i = n; i < this._toon_number; ++i) {
                if (this._toons[i].active) {
                    let toon = this._toons[i],
                        gdata = this._theme.ToonData[toon.genus];
                    if (this.options.blood && gdata.exit) {
                        toon.set_type('exit', toon.direction, Toon.DOWN);
                    } else if (gdata.explosion) {
                        toon.set_type('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                }
                // regardless, set it terminating.
                this._toons[i].terminating = true;
                this._toons[i].Draw();
            }
        }
    },

    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    connect_and_track: function () {
        WindowListener.connect_and_track.apply(this, arguments);
    },

    disconnect_tracked_signals: function () {
        WindowListener.disconnect_tracked_signals.apply(this, arguments);
    }

};
