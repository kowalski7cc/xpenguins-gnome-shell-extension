const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;
const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Shell    = imports.gi.Shell;

const Main = imports.ui.main;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const Region = Me.region;
const Theme  = Me.theme;
const Toon   = Me.toon;
const WindowListener = Me.windowListener.WindowListener.prototype; // this is how we'll keep it in sync for now.
const XPUtil = Me.util;

/* constants */
const PENGUIN_MAX = 255;
const PENGUIN_JUMP = 8;
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

/* Returns a list of XPenguins features that are supported by your version of gnome-shell.
 * Default returns a whitelist (i.e. list.opt == TRUE means supported).
 * Otherwise, you can specificy a blacklist (list.opt == TRUE means blacklisted).
 */
function getCompatibleOptions(blacklist) {
    let list = Me.windowListener.getCompatibleOptions(blacklist);
    /* enable everything else by default */
    let defOpts = XPenguinsLoop.prototype.defaultOptions();
    for (let opt in XPenguinsLoop.prototype.defaultOptions()) {
        if (defOpts.hasOwnProperty(opt) && !list.hasOwnProperty(opt)) {
            list[opt] = !blacklist;
        }
    }
    list.onDesktop = blacklist || false; /* for now we can only run in desktop mode. */
    list.rectangularWindows = blacklist || false; /* for now no shaped windows */
    /* consider: ignoreMaximised, squish, sleep_msec (depends if we're using
     * Clutter.Timeline or mainloop) */
    return list;
}

/************************
 * X penguins main loop: this handles toon behaviour per frame, option configuring,
 * etc. It's basically main.c and xpenguins_core.c (xpenguins_frame()).
 * Note: the component that handles toon_windows (making sure the snapshot of all the 
 * windows on the screen is up to date) is in windowListener.js -- it was helpful
 * as a standalone class during testing.
 * I'd like to keep that as a separate class because it just helps me to keep the
 * two functions (window tracking vs toon stuff) separate in my head and makes
 * it easier for me to work on them.
 ************************/
function XPenguinsLoop() {
    this._init.apply(this, arguments);
}

XPenguinsLoop.prototype = {

    _init: function (i_options) {
        /* set options */
        let options = this.defaultOptions();
        /* copy over custom options */
        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && options.hasOwnProperty(opt)) {
                options[opt] = i_options[opt];
            } else {
                XPUtil.warn('Warning: unknown option %s, ignoring'.format(opt));
            }
        }
        this.options = options;
        this._playing = 0; /* when this is non-0, the animation is playing */
    },

    _initToons: function () {
        XPUtil.DEBUG('[XP] _initToons');
        /* set up global vars to feed in to the toons */
        this._toonGlobals = {
            XPenguinsWindow   : this._XPenguinsWindow,
            toonData          : this._theme.toonData,
            toon_windows      : this._toonWindows,
            edge_block        : this.options.edge_block,
            max_relocate_up   : this.options.max_relocate_up,
            max_relocate_down : this.options.max_relocate_down,
            max_relocate_right: this.options.max_relocate_right,
            max_relocate_left : this.options.max_relocate_left
        };
        /* set the genus of each penguin, respecting the ratios in theme.number? */
        /* Xpenguins makes one of each type, & then give the requested number
         * per genus, so if your genus is at the end and you run out of penguins,
         * then you miss out on all but one.
         * Also initialise them.
         */
         let i,
             genus_numbers = this._theme.number.map(Lang.bind(this,
                    function (i) {
                    return Math.floor(i / this._theme.total * this.options.nPenguins);
                })),
            leftover = this.options.nPenguins - genus_numbers.reduce(function (x, y) { return x + y; }); // note: guaranteed <= theme.ngenera
        while (leftover) { // genera 0 to leftover-1 get 1 extra.
            genus_numbers[--leftover] += 1;
        }

        this._genus = genus_numbers.indexOf(Math.min.apply(null, genus_numbers));
        for (i = 0; i < genus_numbers.length; ++i) {
            while (genus_numbers[i]--) {
                /* Initialise toons */
                this._toons.push(new Toon.Toon(this._toonGlobals, {genus: i, reactive: true}));
                if (this.options.squish) {
                    this._addSquishEvents(this._toons[this._toons.length-1]);
                }
            }
        }

        /* set the stage */
        i = this._theme.toonData.length;
        /* add ToonDatas to the stage so clones can be added properly */
        while (i--) {
            for (let type in this._theme.toonData[i]) {
                if (this._theme.toonData[i].hasOwnProperty(type) && !this._theme.toonData[i][type].master) {
                    /* to fix "Attempting to add actor of type '...' to a container of type '...',
                     * but the actor already has a parent of type '...'.
                     */
                    Main.uiGroup.add_actor(this._theme.toonData[i][type].texture);
                    this._theme.toonData[i][type].texture.hide();
                }
            }
        }

        /* add toons to the stage */
        i = this._toons.length;
        while (i--) {
            Main.layoutManager.addChrome(this._toons[i].actor);
        }
    },

    /* returns a set of default options (wanted to be able to call it as a static method) */
    defaultOptions: function () {
        return {
            /* Load average checking: kill penguins if load is too high
               Start killing toons when the 1-min averaged system load exceeds load1;
                when it exceeds  load2  kill  them  all.
               The toons  will  reappear  when  the load average comes down.
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
             * and anything that fires "map" but not "window-added" is included in ignorePopups. */
            ignorePopups : false,
            /* Enable the penguins to be squished using any of the mouse buttons. */
            squish : false, 
            /* what happens when we switch workspaces. */
            onAllWorkspaces: false, // uhh... this works best with XPenguinsLoop.
            /* whether it's running in windowed mode or on the desktop */
            onDesktop: true,

            /* possible efficiency gain (really, don't bother changing it).
             * Technically in order of most efficient to least:
             * RECALC.END, RECALC.PAUSE, RECALC.ALWAYS. */
            recalcMode: RECALC.ALWAYS,


            /* maximum amount a window can move and the penguin can still cling on */
            max_relocate_up:    16,
            max_relocate_down:  16,
            max_relocate_left:  16,
            max_relocate_right: 16,

            sleep_msec : 0, /* delay in milliseconds between each frame. */
        };
    },

    is_playing: function () {
        return this._playing > 0;
    },

    appendTheme: function (name) {
        if (this._theme) {
            /* stop/start etc */
            this._theme.appendTheme(name);
            this.options.themes.push(name);
        } else {
            this.setThemes([name], true);
        }
    },

    getThemeNames: function (name) {
        return this.options.themes;
    },

    setThemes: function (themeList, setnPenguins) {
        XPUtil.DEBUG('[XP] setThemes');
        /* FIXME: 
         * It would be neat to kill all the penguins of the theme
         * that got removed and initialised them into the theme
         * that got added, but I'm not sure how to manage that --
         * all the toon._toonGlobalstoonData handles are old.
         * I suppose toons could emit a 'dead' signal that allows
         * me to hot-swap the new ToonData in.
         * But for now that's too hard. Just stop the loop & restart.
         */
        let playing = this._playing;
        if (playing) {
            this.exit();
        }
        this.options.themes = themeList;
        this._theme = new Theme.Theme(themeList);
        if (setnPenguins || this.options.nPenguins < 0) {
            this.setNumber(this._theme.total);
        }
        if (playing) {
            this.start();
        }
    },

    /******************
     * START STOP ETC *
     * ****************/
    /* when you send the stop signal to xpenguins (through the toggle) */
    stop: function () {
        XPUtil.DEBUG('STOP');
        this._onInterrupt();
    },

    /* when you really want to kill xpenguins
     * (ie exit sequence has finished)
     * xpenguins_exit()
     */
    exit: function () {
        WindowListener.exit.apply(this, arguments);
        if (this._playing) {
            this._playing = 0;
        }
    },

    /* start the main xpenguins loop: main.c
     * init() should have been called by now.
     */
    start: function () {
        /* calls this.init */
        WindowListener.start.apply(this, arguments);
        /* FIXME: call with lower priority (say GLib.PRIORITY_HIGH_IDLE or DEFAULT_IDLE)? 
         * http://developer.gnome.org/glib/2.31/glib-The-Main-Event-Loop.html#G-PRIORITY-DEFAULT:CAPS 
         */
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT, this.options.sleep_msec, Lang.bind(this, this._frame), null, function() { log("DONEEEE"); });
    },

    /* pauses the timeline & temporarily stops listening for events,
     * *except* for owner.connect(eventName) which sends the resume signal.
     */
    pause: function (hide, owner, eventName, cb) {
        /* pauses the window tracker */
        WindowListener.pause.call(this, hide, owner, eventName, cb); 
        if (this._playing) {
            this._playing = 0;
            if (hide) {
                this._hideToons();
            }
        }
    },

    /* resumes timeline, connects up events */
    resume: function () { 
        /* resume window tracker */
        WindowListener.resume.apply(this, arguments); 
        if (this._toons[0] && !this._toons[0].visible) {
            this._showToons();
        }
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT, this.options.sleep_msec, Lang.bind(this, this._frame));
    },

    /* stop xpenguins, but play the exit sequence */
    _onInterrupt: function () {
        XPUtil.DEBUG(_("Interrupt received: Exiting."));

        /* set the 'exit gracefully flag' */
        //ToonConfigure(Toon.EXITGRACEFULLY);
        this._exiting = true;
        this.setNumber(0);
    },


    /* ToonFinishUp in toon_end.c
     */
    _cleanUp: function () {
        XPUtil.DEBUG('[XP] _cleanUp');
        let i;

        /* clean up Clutter.threads_add_timeout */
        if (this._playing) {
            this._playing = 0;
        }

        /* disconnect events */
        this._disconnectSignals();
        if (this._sleepID) {
            Mainloop.source_remove(this._sleepID);
        }

        /* remove god mode */
        if (this.options.squish) {
            this.toggleGodMode(false);
        }

        /* remove toons from stage & destroy */
        i = this._toons.length;
        while (i--) {
            Main.layoutManager.removeChrome(this._toons[i].actor);
            this._toons[i].destroy();
        }

        /* remove toonDatas from the stage */
        i = this._theme.toonData.length;
        while (i--) {
            for (let type in this._theme.toonData[i]) {
                if (this._theme.toonData[i].hasOwnProperty(type) && !this._theme.toonData[i][type].master) {
                    Main.uiGroup.remove_actor(this._theme.toonData[i][type].texture);
                }
            }
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
        XPUtil.DEBUG('[XP] init');

        /* signals */
        this._sleepID = null;
        this._playing = 0;
        this._resumeSignal = {}; /* when you pause you have to listen for an event to unpause */

        /* variables */
        this._toons = [];
        /* The number of penguins that are active or not terminating.
         * When 0, we can call xpenguins_exit()
         */
        this._toonNumber = 0;
        this._cycle = 0;
        this._tempFRAMENUMBER = 0;
        this._exiting = false;
        this._XPenguinsWindow = null;
        this._genus = 0;

        this._dirty = true;
        this._listeningPerWindow = false; /* whether we have to listen to individual windows for signals */

        /* Laziness */
        let opt = this.options;
        /* If they set onAllWorkspaces but are running in a window,
         * unset onAllWorkspaces
         */
        if (opt.onAllWorkspaces && !opt.onDesktop) {
            XPUtil.DEBUG(_("Warning: onAllWorkspaces is TRUE but running in a window, setting onAllWorkspaces to FALSE"));
            opt.onAllWorkspaces = false;
        }

        /* Set the number of penguins */
        if (opt.nPenguins >= 0) {
            this.setNumber(opt.nPenguins);
        }

        /* Load theme into this._theme, if not already done */
        if (!this._theme) {
            this.setThemes(opt.themes);
        }

        /* theme-specific options */
        if (!opt.sleep_msec) {
            opt.sleep_msec = this._theme.delay;
        }

        /* See if load averaging will work */
        if (opt.load1 >= 0) {
            let load = XPUtil.loadAverage();
            if (load < 0) {
                XPUtil.DEBUG(_("Warning: cannot detect load averages on this system"));
                opt.load1 = -1;
                opt.load2 = -1;
            } else {
                opt.load_cycles = opt.load_check_interval / opt.sleep_msec;
            }
        }

        /* Set up the window we're drawing on.
         * (has not been implemented yet beyond this._XPenguinsWindow = global.stage).
         * _XPenguinsWindow is the *actor*.
         */
        if (!opt.onDesktop) {
            XPUtil.DEBUG('WINDOWED MODE: not yet implemented, running on desktop');
            opt.onDesktop = true;
        }
        this._XPenguinsWindow = global.stage;
        let tmp = this.options.onAllWorkspaces;
        this.options.onAllWorkspaces = null;
        /* do appropriate config for onAllWorkspaces */
        this.changeOption('onAllWorkspaces', tmp);

        /* set up god mode */
        if (opt.squish) {
            this.toggleGodMode(true);
        }

        /* set up toon_windows */
        this._toonWindows = new Region.Region();

        /* set up toons */
        this._initToons();

        /* Connect signals */
        this._connectSignals();

        this._updateToonWindows();
    },

    changeOption: function (propName, propVal) {
        /* Window tracking-specific options */
        if (WindowListener.options.hasOwnProperty(propName)) {
            WindowListener.changeOption.call(this, propName, propVal);
            this._dirtyToonWindows('changeOption');
        } else {
        /* XPENGUIN-specific options. */
            XPUtil.DEBUG('changeOption[XP]: %s = %s', propName, propVal);
            if (!this.options.hasOwnProperty(propName) || this.options[propName] === propVal) {
                return;
            }
            if (propName === 'nPenguins') {
                this.setNumber(propVal);
            } else if (propName === 'themes') {
                this.setThemes(propVal);
            } else {
                this.options[propName] = propVal;
                /* actions to be taken if the timeline is playing */
                if (this.is_playing()) {
                    if (propName === 'squish') {
                    /* enable god mode */
                        this.toggleGodMode(propVal);
                    }
                    /* Otherwise, things like angels, blood: these things can just be
                     * set and no recalculating of signals etc or extra action
                     * need be done.
                     */
                }
            } 
        } // whether xpenguins or window-listener option
    },

    /***** Signals ****/
    /* connects up events required to maintain toonWindows as an accurate
     * snapshot of what the windows on the workspace look like
     */
    _connectSignals: function () { WindowListener._connectSignals.apply(this, arguments); },
    _disconnectSignals: function () { WindowListener._disconnectSignals.apply(this, arguments); },
    _updateSignals: function () { WindowListener._updateSignals.apply(this, arguments); },
    _onWindowAdded: function () { WindowListener._onWindowAdded.apply(this, arguments); },
    _onWindowRemoved: function () { WindowListener._onWindowRemoved.apply(this, arguments); },
    _onWorkspaceChanged: function () { WindowListener._onWorkspaceChanged.apply(this, arguments); },

    /********** TOON WINDOWS **************/
    _dirtyToonWindows: function (msg) {
        XPUtil.DEBUG('[XP] _dirtyToonWindows %s', msg);
        this._dirty = true;
    },

    _updateToonWindows: function () {
        XPUtil.DEBUG(('[XP] _updateToonWindows. dirty: ' + this._dirty));
        /* populate toonWindows (a Region, basically a list of Meta.Rect.
         * Also store the 'wid' of each window, to associate toons with. */
        WindowListener._updateToonWindows.apply(this, arguments);
        this._dirty = false;
    },

    /**************** GOD MODE **************/
    toggleGodMode: function (onoff) {
        XPUtil.DEBUG('!!!!!!!!!! toggling GOD MODE !!!!!!!!!!');
        let i = this._toons.length;
        if (onoff) {
            while (i--) { 
                if (this._toons[i].active) {
                    this._addSquishEvents(this._toons[i]);
                }
            }
        } else {
            while (i--) { 
                this._removeSquishEvents(this._toons[i]);
            }

            /* change cursor back */
            global.unset_cursor();
        }
    },

    _addSquishEvents: function (toon) {
        if (toon.actor.get_reactive()) {
            /* already has squish events. */
            return;
        }
        XPUtil.DEBUG('adding squish events');
        toon.actor.set_reactive(true);
        /* kill toon on click, change cursor to "smite" icon on mouseover. */
        // FIXME: "smite" icon is currently a hand. Make it something
        // suitably god-like, like a lightning bolt :P
        this._connectAndTrack(toon, toon.actor, 
            'button-press-event', 
            Lang.bind(this, this._onSmite, toon));
        this._connectAndTrack(toon, toon.actor,
            'enter-event', function () {
                global.set_cursor(Shell.Cursor.POINTING_HAND);
                return true; /* event fully handled, do not pass on */
            }); 
        this._connectAndTrack(toon, toon.actor,
            'leave-event', function () {
                global.unset_cursor();
                return true; /* event fully handled, do not pass on */
            }); 
    },

    _removeSquishEvents: function (toon) {
        XPUtil.DEBUG('removing squish events');
        toon.actor.set_reactive(false);
        this._disconnectTrackedSignals(toon);
    },

    _onSmite: function (actor, event, toon) {
        XPUtil.DEBUG('OWWWIEEE!');
        /* Not in Clutter-gir. button 1 == PRIMARY, 2 == MIDDLE, 3 == SECONDARY */
        if (event.get_button() !== 1) {
            return false; /* pass on the event */
        }
        /* Event coordinates are relative to the stage that received the event,
         * and can be transformed into actor-relative coordinates: actor.transform_stage_point
        let [stageX, stageY] = event.get_coords();
        XPUtil.DEBUG('SMITE at %d, %d'.format(stageX, stageY));
         */

        /* squash if it's not already dead/dying.
         * Gosh, that's a lot of ways for the toons to die, isn't it?
         */
        if (toon.type !== 'explosion' && toon.type !== 'zapped' &&
                toon.type !== 'squashed' && toon.type !== 'angel' &&
                toon.type !== 'splatted' && toon.type !== 'exit' &&
                !toon.terminating) {
            let gdata = this._theme.toonData[toon.genus];
            /* Kill the toon */
            if (this.options.blood && gdata.zapped) {
                toon.setType('zapped', toon.direction, Toon.DOWN);
            } else if (gdata.explosion) {
                toon.setType('explosion', toon.direction, Toon.HERE);
            } else {
                toon.active = false;
            }
            toon.setAssociation(Toon.UNASSOCIATED);
        }
        return true; /* event fully handled, do not pass on */
    },

    /******** TOONS ********/
    _hideToons: function () {
        for (let i = 0; i < this._toons.length; ++i) {
            this._toons[i].hide();
        }
    },

    _showToons: function () {
        for (let i = 0; i < this._toons.length; ++i) {
            this._toons[i].show();
        }
    },


    /* _frame is called every frame of the iteration.
     * It consists of two parts:
     *
     * xpenguins_frame()
     * advances one frame of the xpenguins iteration,
     *  & returns the number of active penguins.
     *  (or the *last* active penguin?!)
     *
     * main loop: controls whether to hibernate,
     * load averaging, etc.
     * main.c
     */
    _frame: function () {
        ++this._tempFRAMENUMBER;
        XPUtil.DEBUG('FRAME ' + this._tempFRAMENUMBER + ' _toonNumber: ' + this._toonNumber);

        /* xpenguins_frame() */
        let sstatus = null,
            last_active = -1,
            o = this.options;

        /* Check if events were received & we need to update toonWindows */
        if (this._dirty) {
            let i = this._toonNumber;
            /* calculate for squashed toons */
            while (i--) {
                this._toons[i].calculateAssociations();
            }
            this._updateToonWindows();
            i = this._toonNumber;
            while (i--) {
                this._toons[i].relocateAssociated();
            }
        }

        /* Loop through all the toons *
         * NOTE: this.options.nPenguins is set always and the max. number of penguins to display.
         *       this._toonNumber is the number of penguins *currently* active or not terminating,
         *       and can change from loop to loop.
         *       If it's 0, we quit.
         * this.options.nPenguins    <-> npenguins
         * this._toonNumber <-> penguin_number
         */
        for (let i = 0; i < this._toonNumber; ++i) {
            let toon = this._toons[i];

            if (!toon.active) {
                if (!toon.terminating) {
                    // it's done terminating and needs to be reborn.
                    toon.init();
                    last_active = i;
                } else {
                    toon.hide();
                }
            } else {
                /* laziness */
                let u,
                    gdata = this._theme.toonData[toon.genus];
                last_active = i;

                /* see if the toon is squashed */
                if (!((toon.data.conf & Toon.NOBLOCK) || (toon.data.conf & Toon.INVULNERABLE)) &&
                        toon.blocked(Toon.HERE)) {
                    XPUtil.DEBUG('EXPLODING');
                    if (o.blood && gdata.squashed) {
                        toon.setType('squashed', toon.direction, Toon.HERE);
                    } else if (gdata.explosion) {
                        toon.setType('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                    toon.setVelocity(0, 0);
                    toon.setAssociation(Toon.UNASSOCIATED);
                } else { // whether squashed
                    /* move the toon */
                    sstatus = toon.advance(Toon.MOVE);
                    // switch (toon.type)
                    if (toon.type === 'faller') {
                        // sstatus != Toon.OK !!!
                        if (sstatus !== Toon.OK) {
                            /* if it has landed change type appropriately */
                            if (toon.blocked(Toon.DOWN)) {
                                toon.direction = (toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2));
                                toon.makeWalker(false);
                                toon.pref_direction = -1;
                            } else {
                                /* turn into climber (if exists) or bounce off */
                                if (!gdata.climber || XPUtil.RandInt(2)) {
                                    toon.setVelocity(-toon.u, gdata.faller.speed);
                                } else {
                                    toon.direction = +(toon.u > 0);
                                    toon.makeClimber();
                                }
                            }
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
                                toon.setType('splatted', Toon.LEFT, Toon.DOWN);
                                toon.setAssociation(Toon.DOWN);
                                toon.setVelocity(0, 0);
                            } else {
                                /* got lucky - didn't splat (or !options.blood): walk */
                                toon.direction = (toon.pref_direction > -1 ?
                                                   toon.pref_direction : XPUtil.RandInt(2));
                                toon.makeWalker(false);
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
                                if (!toon.offsetBlocked(u, -PENGUIN_JUMP)) {
                                    toon.move_by(u, -PENGUIN_JUMP);
                                    toon.setVelocity(0, PENGUIN_JUMP - 1);
                                    toon.advance(Toon.MOVE);
                                    toon.setVelocity(u, 0);
                                    /* don't forget to accelerate! */
                                    if (Math.abs(u) < toon.data.terminal_velocity) {
                                        if (toon.direction) {
                                            toon.u += toon.data.acceleration;
                                        } else {
                                            toon.u -= toon.data.acceleration;
                                        }
                                    } 
                                } else {
                                    /* can't jump! we can turn around, fly or climb */
                                    let n = XPUtil.RandInt(8) * (1 - toon.pref_climb);
                                    if (n < 2) {
                                        if ((n === 0 || !gdata.floater) && gdata.climber) {
                                            toon.makeClimber();
                                            //break
                                        } else if (gdata.floater) {
                                            /* make floater */
                                            let newdir = +!toon.direction; // coerce to int
                                            toon.setType('floater', newdir, Toon.DOWN);
                                            toon.setAssociation(Toon.UNASSOCIATED);
                                            toon.setVelocity((XPUtil.RandInt(5) + 1) * (newdir * 2 - 1),
                                                               -gdata.floater.speed);
                                            // break
                                        }
                                    } else {
                                      /* Change direction *after* creating toon to make sure
                                      that a runner doesn't get instantly squashed... */
                                        toon.makeWalker(false);
                                        toon.direction = +!toon.direction; //coerce to int
                                        toon.u = -toon.u;
                                    }
                                }
                            }
                        } else if (!toon.blocked(Toon.DOWN)) {
                            /* try to step (tumble/fall) down... */
                            u = toon.u;
                            toon.setVelocity(0, PENGUIN_JUMP);
                            sstatus = toon.advance(Toon.MOVE);
                            if (sstatus === Toon.OK) {
                                toon.pref_direction = toon.direction;
                                if (gdata.tumbler) {
                                    toon.setType('tumbler', toon.direction, Toon.DOWN);
                                    toon.setAssociation(Toon.UNASSOCIATED);
                                    toon.setVelocity(0, gdata.tumbler.speed);
                                } else {
                                    toon.makeFaller();
                                    toon.u = 0;
                                }
                                toon.pref_climb = false;
                            } else { /* couldn't tumble down */
                                toon.setVelocity(u, 0);
                            }
                        /* 1/100 chance of becoming actionX */
                        } else if (gdata.action0 && !XPUtil.RandInt(100)) {
                            /* pick a random action */
                            let actionN = 'action%d'.format(XPUtil.RandInt(this._theme.nactions[toon.genus]));
                            log('new action: ' + actionN);
                            /* If we have enough space, start the action: */
                            if (!toon.checkBlocked(actionN, Toon.DOWN)) {
                                toon.setType(actionN, toon.direction, Toon.DOWN);
                                toon.setVelocity(gdata[actionN].speed * (2 * toon.direction - 1), 0);
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
                            if (!toon.offsetBlocked(u, -PENGUIN_JUMP)) {
                                /* try to drift up */
                                toon.move_by(u, -PENGUIN_JUMP);
                                toon.setVelocity(0, PENGUIN_JUMP - 1);
                                toon.advance(Toon.MOVE);
                                toon.setVelocity(u, 0);
                            } else {
                                /* blocked! Turn back into a walker */
                                toon.makeWalker(false);
                            }
                        } else if (!toon.blocked(Toon.DOWN)) {
                            /* space below, drift down (tumble or fall) */
                            toon.setVelocity(0, PENGUIN_JUMP);
                            sstatus = toon.advance(Toon.MOVE);
                            if (sstatus === Toon.OK) {
                                if (gdata.tumbler) {
                                    toon.setType('tumbler', toon.direction, Toon.DOWN);
                                    toon.setAssociation(Toon.UNASSOCIATED);
                                    toon.setVelocity(0, gdata.tumbler.speed);
                                } else {
                                    toon.makeFaller();
                                }
                                toon.pref_climb = false;
                            } else {
                                /* can't drift down, go sideways */
                                toon.setVelocity(toon.data.speed * (2 * toon.direction - 1), 0);
                            }
                        } else if (toon.frame === 0) {
                            /* continue the action, or if you're finished loop/turn into walker */
                            let loop = toon.data.loop;
                            if (!loop) {
                                loop = -10;
                            }
                            if (loop < 0) {
                                if (!XPUtil.RandInt(-loop)) {
                                    toon.makeWalker(false);
                                }
                            } else if (toon.cycle >= loop) {
                                toon.makeWalker(false);
                            }
                        }
                    /* climber */
                    } else if (toon.type === 'climber') {
                        var direction = toon.direction;
                        if (toon.y < 0) {
                            /* reached top of screen, fall down */
                            toon.direction = +!direction;
                            toon.makeFaller();
                            toon.pref_climb = false;
                        } else if (sstatus === Toon.BLOCKED) {
                            /* try to step out... */
                            let v = toon.v,
                                xoffset = (1 - direction * 2) * PENGUIN_JUMP;
                            if (!toon.offsetBlocked(xoffset, v)) {
                                toon.move_by(xoffset, v);
                                toon.setVelocity(-xoffset - (1 - direction * 2), 0);
                                toon.advance(Toon.MOVE);
                                toon.setVelocity(0, v);
                            } else {
                                toon.direction = +!direction;
                                toon.makeFaller();
                                toon.pref_climb = false;
                            }
                        } else if (!toon.blocked(direction)) {
                            /* reached the top, start walking */
                            if (toon.offsetBlocked((2 * direction - 1) * PENGUIN_JUMP, 0)) {
                                toon.setVelocity((2 * direction - 1) * (PENGUIN_JUMP - 1), 0);
                                toon.advance(Toon.MOVE);
                                toon.setVelocity(0, -toon.data.speed);
                            } else {
                                toon.makeWalker(true);
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
                            toon.makeFaller();
                        } else if (sstatus !== Toon.OK) {
                            if (toon.blocked(Toon.UP)) {
                                toon.direction = +(toon.u > 0);
                                toon.makeFaller();
                            } else {
                                toon.direction = +!toon.direction;
                                toon.setVelocity(-toon.u, -toon.data.speed);
                            }
                        }
                    /* explosion */
                    } else if (toon.type === 'explosion') {
                        /* turn into angel */
                        if (o.angels && !toon.terminating && gdata.angel) {
                            toon.setType('angel', toon.direction, Toon.HERE);
                            toon.setVelocity(XPUtil.RandInt(5) - 2, -gdata.angel.speed);
                            toon.setAssociation(Toon.UNASSOCIATED);
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

            /* update clip frame to advance animation */
            toon.draw();

        } // penguin loop
        /* store the number of active/non-terminating penguins */
        this._toonNumber = last_active + 1;
        /************* END xpenguins_frame() ************/


        /************* START main loop ************/
        /* If there are no toons left & 'exiting' has been signalled,
         * then we've just finished killing all the penguins.
         */
        if (!this._toonNumber && this._exiting) {
            XPUtil.DEBUG(_("Done."));
            this.exit();
            return false;
        }
        if (this._exiting) {
            XPUtil.DEBUG('.');
        }

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
                this.setNumber(newp);
            }
            XPUtil.DEBUG(_("Adjusting number according to load"));
            this._cycle = 0;
        } else if (!(this._toonNumber)) {
            /* No penguins active, but not exiting either.
             * Hibernate for 5 seconds... */
            this._cycle = o.load_cycles;

            this.pause();
            this._sleepID = Mainloop.timeout_add(o.load_check_interval,
                Lang.bind(this, function () {
                    this.resume();
                    return false;  // return false to call just once.
                }));
        }
        ++this._cycle;

        return this._playing;
    }, // _frame

    setNumber: function (n) {
        XPUtil.DEBUG('setNumber(%d)', n);
        if (!this._playing) {
            this.options.nPenguins = n;
            this._toonNumber = n;
            return;
        }
        // want to spawn more penguins
        if (n > this._toonNumber) {
            n = Math.min(PENGUIN_MAX, n);
            for (let i = this._toonNumber; i < n; ++i) {
                /* reuse an old toon if it exists (in the old genus), 
                 * otherwise make a new one. Just rotate around the
                 * genii.
                 */
                if (i >= this._toons.length) {
                    this._toons[i] = new Toon.Toon(this._toonGlobals, {genus: this._genus});
                    this._genus = (this._genus + 1) % this._theme.ngenera;
                    Main.layoutManager.addChrome(this._toons[i].actor);
                } else {
                    this._toons[i].init();
                    this._toons[i].show();
                }
                if (this.options.squish) {
                    this._addSquishEvents(this._toons[i]);
                }
                this._toons[i].active = true;
            }
            this._toonNumber = n;
        } else if (n < this._toonNumber) {
            /* there are some active penguins that have to be killed */
            n = Math.max(n, 0);
            for (let i = n; i < this._toonNumber; ++i) {
                if (this._toons[i].active) {
                    let toon = this._toons[i],
                        gdata = this._theme.toonData[toon.genus];
                    if (this.options.blood && gdata.exit) {
                        toon.setType('exit', toon.direction, Toon.DOWN);
                    } else if (gdata.explosion) {
                        toon.setType('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                }
                if (this.options.squish) {
                    this._removeSquishEvents(this._toons[i]);
                }
                // regardless, set it terminating.
                this._toons[i].terminating = true;
                // NOTE: toons are not popped from this._toons after dying,
                // and hence can be reused.
            }
        }
    },

    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape extension:
     * signals are stored by the owner, storing both the target & the id to clean up later
     */
    _connectAndTrack: function () {
        WindowListener._connectAndTrack.apply(this, arguments);
    },

    _disconnectTrackedSignals: function () {
        WindowListener._disconnectTrackedSignals.apply(this, arguments);
    }

};
