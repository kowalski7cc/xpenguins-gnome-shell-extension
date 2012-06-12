/* BIG UPTO:
 * * test load averaging
 */
const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;
const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Shell    = imports.gi.Shell;
const Signals  = imports.signals;

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
const ThemeManager = Me.themeManager;
const Toon   = Me.toon;
// this is how we'll keep in sync with this functionality for now.
const WindowListener = Me.windowListener.WindowListener.prototype;
const XPUtil = Me.util;

/* constants */
const PENGUIN_MAX = 50; /* per theme */
const PENGUIN_JUMP = 8;
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

const ALL = -1;

/* Returns a list of XPenguins features that are supported by your version 
 * of gnome-shell. 
 * By default, returns a whitelist (i.e. list.opt TRUE means supported).
 * Otherwise, you can specificy a blacklist (list.opt TRUE means blacklisted).
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
    list.onDesktop = blacklist || false; // for now we can't do windowed mode.
    list.rectangularWindows = blacklist || false; // for now no shaped windows
    return list;
}

/************************
 * X penguins main loop: this handles toon behaviour per frame, option 
 * configuring, etc. It's basically main.c and xpenguins_core.c 
 * (xpenguins_frame()).
 * Note: the component that handles toon_windows (making sure the snapshot
 * of all the windows on the screen is up to date) is in windowListener.js: 
 * it was helpful as a standalone class during testing.
 * I'd like to keep that as a separate class because it just helps me to keep 
 * the two functions (window tracking vs toon stuff) separate in my head 
 * and makes it easier for me to work on them.
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
        this._numbers = {};
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

        /* add ToonDatas to the stage so clones can be added properly */
        this._addToonDataToStage(ALL);

        /* temporarily set _playing = true so .setNumber will initialise toons.
         * Use default amount if none specified by now.
         */ 
        this._playing = true;
        /* bit of a hack to get _setNumbers to init penguins */
        let i = this.themeList.length,
            oldNumbers = this._numbers;
        this._numbers = {};
        // BAH: causes segfault when we run if oldNumbers is not {}
        while (i--) {
            XPUtil.DEBUG('setThemeNumbers(%s, %d)', this.themeList[i], 
                oldNumbers[this.themeList[i]]);
            this.setThemeNumbers(this.themeList[i], 
                oldNumbers[this.themeList[i]] || -1);
        }
        this._playing = 0;

    },

    /* add ToonDatas to the stage so clones can be added properly */
    _addToonDataToStage: function (theme) {
        let genii = [];
        if (theme === ALL) {
            /* do all */
            for (let igenus in this._theme.toonData) {
                if (this._theme.toonData.hasOwnProperty(igenus)) {
                    genii.push(igenus);
                }
            }
        } else {
            genii = this._theme.getGeniiForTheme(theme);
        }
        let i = genii.length;
        while (i--) {
            let gdata = this._theme.toonData[genii[i]];
            for (let type in gdata) {
                if (gdata.hasOwnProperty(type) && !gdata[type].master) {
                    /* to fix "Attempting to add actor of type '...' to a 
                     * container of type '...', but the actor already has
                     * a parent of type '...'.
                     */
                    Main.uiGroup.add_actor(gdata[type].texture);
                    gdata[type].texture.hide();
                }
            }
        }
    },

    /* returns a set of default options (wanted to be able to call it as a 
     * static method)
     */
    defaultOptions: function () {
        return {
            /* Load average checking: kill penguins if load is too high
               Start killing toons when the 1-min averaged system load 
                exceeds load1; when it exceeds load2  kill them  all.
               The toons  will  reappear  when  the load average comes down.
               When there are no  toons  on  the screen, XPenguins uses 
                only a miniscule amount of CPU time - it just wakes up 
                every 5 seconds to recheck the load.
             */
            load_check_interval : 5000, // ms between load average checks 
            load_cycles: 0, // number of frames between load average checks 
            load1 : -1.0, // Start killing penguins if load reaches this amount 
            load2 : -1.0, // All gone by this amount (but can come back!) 

            edge_block : Toon.SIDEBOTTOMBLOCK, // side & edges of screen block
                                               // toons
            /* flags */
            angels : true, // don't show angels flying up to heaven on squash
            blood : true,  // don't show gory death sequences
            ignoreMaximised : true, // maximised windows are not solid
            ignoreHalfMaximised : true, // if the above is true, half maximised
                                        // windows are also not solid.
            ignorePopups : false, // ignore popup windows (right-click menus,
                                  // tooltips, ...). Ie anything firing 'map'
                                  // but not 'window-added'.
            squish : false, // squish toons with the mouse.
            onAllWorkspaces: false, // what happens when we switch workspaces.
            onDesktop: true, // whether we're running in windowed mode.

            /* possible efficiency gain (really, don't bother changing it).
             * Technically in order of most efficient to least:
             * RECALC.END, RECALC.PAUSE, RECALC.ALWAYS. */
            recalcMode: RECALC.ALWAYS,

            /* maximum amount a window can move for the penguin to still 
             * cling on */
            max_relocate_up:    16,
            max_relocate_down:  16,
            max_relocate_left:  16,
            max_relocate_right: 16,

            sleep_msec : 0, // delay in milliseconds between each frame.
        };
    },

    is_playing: function () {
        return this._playing > 0;
    },

    /* returns array of themes with non-zero toons */
    getThemes: function () {
        return this.themeList.filter(Lang.bind(this, function (name) {
            return this._numbers && this._numbers[name];
        }));
    },

    /* use this to wipe the board and set new themes.
     * DO NOT call while loop is in progress, might barf on you.
     * It *does not* set the number of penguins (but init() will do that)
     */
    setThemes: function (themeList) {
        XPUtil.DEBUG('[XP] setThemes');
        /* stop if in progress */
        let playing = this._playing;
        if (playing) {
            this.exit();
        }

        /* create theme */
        this._theme = new Theme.Theme(themeList);
        this.themeList = themeList;

        /* restart if it was playing before */
        if (playing) {
            this.start();
        }
    },

    /* use this to set toon numbers per theme whilst XPenguins is running.
     * Also used to append/remove themes:
     * If you set a number for a theme that doesn't currently exist it will be loaded.
     * If you set a current theme to 0 it will be killed.
     *  (well, the reference still remains...)
     * If you specify number = -1, the default for that theme will be used.
     */
    setThemeNumbers: function(inames, ns, silent) {
        XPUtil.DEBUG('[XP] setThemeNumbers');
        if (!(inames instanceof Array)) {
            inames = [inames];
        }
        if (!this._theme) {
            this.setThemes(inames);
        }
        let i = inames.length;
        while (i--) {
            let n = ns instanceof Array ? ns[i] : ns,
                name = inames[i];
            XPUtil.DEBUG(' .. %s: %d', name, n);
            if (!this._theme.hasTheme(name)) {
                if (n) {
                    this._theme.appendTheme(name);
                    this.themeList.push(name);
                    this._addToonDataToStage(name);
                } else {
                    continue;
                }
            }
            this._originalNumber -= (this._numbers[name] || 0);
            // if n is <0, use default.
            if (n < 0) {
                n = this._theme.getTotalForTheme(name);
            } else if (n === 0) {
                this.themeList.splice(this.themeList.indexOf(name), 1);
            }
            XPUtil.DEBUG(' .. calling this._setNumber(%s, %d)', name, n);
            this._setNumber(name, n, silent);
            /* for load averaging: store a copy of the originals */
            this._originalNumber += this._numbers[name];
        }
    },

    /* sets the total number of penguins in the entire animation to n,
     * basically setting the # toons approx. equal for each theme
     * (it was easier than trying to *remove* an approx. equal number
     * for each theme, which could kill some themes).
     */
    _setTotalNumber: function(n, silent) {
        n = Math.min(PENGUIN_MAX, Math.max(0, n));
        let i = this.themeList.length,
            numEach = Math.floor(n / i),
            remainder = n - numEach * i;
        /* indices 0 to remainder-1 have an extra toon added */
        while (i--) {
            this._setNumber(this.themeList[i], numEach + (i < remainder), silent);
        }
    },

    /* sets the toon number. for a *single* theme. */
    _setNumber: function (iname, n, silent) {
        let name = ThemeManager.sanitiseThemeName(iname);
        n = Math.min(PENGUIN_MAX, Math.max(0, n));
        XPUtil.DEBUG('_setNumber(%s, %d)', name, n);

        if (!this._playing) {
            this._numbers[name] = n;
            if (!silent) {
                this.emit('ntoons-changed', name, n);
            }
            return;
        }

        let current = this._numbers[name] || 0;
        /* At the moment we maintain an array of 'dead' toons (indices into
         * this._toons) to respawn new toons.
         * However, might have to add a check: if they made 100000 toons and
         * then cut it back to 10, we have 999990 empty slots to carry around.
         */ 
        XPUtil.DEBUG(' .. current: %d. requested: %d', current, n);
        if (n > current) {
            /* assign the numbers per genus */
            let idx,
                genusNumbers = this._theme.getGenusNumbersForTheme(name),
                genii = this._theme.getGeniiForTheme(name),
                totalForTheme = this._theme.getTotalForTheme(name),
                leftover = n,
                genus = 0,
                genusThresh = 0;
            /* calculate according to default ratios */ 
            genusNumbers = genusNumbers.map(function (i) {
                let num = Math.floor(i / totalForTheme * n);
                leftover -= num;
               return num;
            });
            while (leftover) { // genera 0 to leftover-1 get 1 extra.
                genusNumbers[--leftover] += 1;
            }
            genusThresh = genusNumbers[0];

            /* spawn more toons of that theme */
            for (let i = 0; i < (n - current); ++i) {
                /* calculate new genus */
                if (i >= genusThresh) {
                    genusThresh += genusNumbers[++genus];
                }
                if (this._deadToons.length) {
                    /* reuse an old toon */
                    idx = this._deadToons.pop();
                    this._toons[idx].init(genii[genus]);
                    this._toons[idx].show();
                } else {
                    /* make a new toon */
                    idx = this._toons.push(new Toon.Toon(this._toonGlobals,
                        {genus: genii[genus]})) - 1;
                    Main.layoutManager.addChrome(this._toons[idx].actor);
                } 
                this._toons[idx].theme = name;
                if (this.options.squish) {
                    this._addSquishEvents(this._toons[idx]);
                }
                this._toons[idx].active = true;
            }
            this._numbers[name] = n;
            if (!silent) {
                this.emit('ntoons-changed', name, n);
            }
        } else if (n < current) {
            /* kill toons of that theme. 
             * A bit inefficient - will have to loop through the entire
             * this._toons looking for the first (current-n) toons.
             * TODO: if we're maining deadToon then why not
             *  toonIdxs[genus] ?
             */
            let left = (current - n);
            for (let i = 0; i < this._toons.length && left; ++i) {
                if (this._toons[i].theme === name) {
                    left--;
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
                }
            }
        } // whether to add or delete toons
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
        /* FIXME: call with lower priority (say GLib.PRIORITY_HIGH_IDLE or 
         * DEFAULT_IDLE)? 
         * http://developer.gnome.org/glib/2.31/glib-The-Main-Event-Loop.html#G-PRIORITY-DEFAULT:CAPS 
         */
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT,
            this.options.sleep_msec, Lang.bind(this, this._frame));
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
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT, 
            this.options.sleep_msec, Lang.bind(this, this._frame));
    },

    /* stop xpenguins, but play the exit sequence */
    _onInterrupt: function () {
        XPUtil.DEBUG(_("Interrupt received: Exiting."));

        /* tell the loop to start the exit sequence */
        this._exiting = true;
        this._setTotalNumber(0, true); // don't emit signal. (?? FIXME)
    },


    /* ToonFinishUp in toon_end.c */
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
        for (i in this._theme.toonData) {
            if (this._theme.toonData.hasOwnProperty(i)) {
                let gdata = this._theme.toonData[i];
                for (let type in gdata) {
                    if (gdata.hasOwnProperty(type) &&
                            !this._theme.toonData[i][type].master) {
                        Main.uiGroup.remove_actor(gdata[type].texture);
                    }
                }
            }
        }

        /* destroy theme */
        if (this._theme) {
            this._theme.destroy();
        }

        /* delete references to big objects to help free up memory */
        delete this._toonGlobals;
        delete this._theme;
        this._toons = [];
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
        this._resumeSignal = {}; // holds the signal we listen to to resume

        /* variables */
        this._toons = [];
        this._deadToons = [];
        /* The number of penguins that are active or not terminating.
         * When 0, we can call xpenguins_exit() */
        this._numbers = this._numbers || {};
        this._originalNumber = 0; // store original requested nPenguins for 
                                  // load averaging.

        this._cycle = 0;
        this._tempFRAMENUMBER = 0;
        this._exiting = false;
        this._XPenguinsWindow = null;

        this._dirty = true;
        this._listeningPerWindow = false;

        /* Laziness */
        let opt = this.options;
        /* If they set onAllWorkspaces but are running in a window,
         * unset onAllWorkspaces
         */
        if (opt.onAllWorkspaces && !opt.onDesktop) {
            XPUtil.DEBUG(_("Warning: onAllWorkspaces is TRUE but running in a window, setting onAllWorkspaces to FALSE"));
            opt.onAllWorkspaces = false;
        }

        /* Load theme into this._theme, if not already done */
        if (!this.themeList) {
            this.themeList = [];
        }

        if (!this._theme) {
            this.setThemes(this.themeList);
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
         * (has not been implemented yet besides global.stage).
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
            if (!this.options.hasOwnProperty(propName) || 
                    this.options[propName] === propVal) {
                return;
            }
            this.options[propName] = propVal;
            /* actions to be taken if the timeline is playing */
            if (this.is_playing()) {
                if (propName === 'squish') {
                /* enable god mode */
                    this.toggleGodMode(propVal);
                }
                /* Otherwise, things like angels, blood: these things can just
                 * be set and no recalculating of signals etc or extra action
                 * need be done.
                 */
            }
        } // whether xpenguins or window-listener option
    },

    /***** Signals ****/
    /* connects up events required to maintain toonWindows as an accurate
     * snapshot of what the windows on the workspace look like
     */
    _connectSignals: function () { 
        WindowListener._connectSignals.apply(this, arguments); 
    },
    _disconnectSignals: function () { 
        WindowListener._disconnectSignals.apply(this, arguments); 
    },
    _updateSignals: function () { 
        WindowListener._updateSignals.apply(this, arguments); 
    },
    _onWindowAdded: function () { 
        WindowListener._onWindowAdded.apply(this, arguments); 
    },
    _onWindowRemoved: function () { 
        WindowListener._onWindowRemoved.apply(this, arguments); 
    },
    _onWorkspaceChanged: function () { 
        WindowListener._onWorkspaceChanged.apply(this, arguments); 
    },

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
        /* Not in Clutter-gir. button 1: PRIMARY, 2: MIDDLE, 3: SECONDARY */
        if (event.get_button() !== 1) {
            return false; /* pass on the event */
        }
        /* Event coordinates are relative to the stage that received the event,
         * and can be transformed into actor-relative coordinates using
         * actor.transform_stage_point().
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
        XPUtil.DEBUG('FRAME %d _toonNumber: %d', this._tempFRAMENUMBER, 
            this._toons.length - this._deadToons.length);

        /* xpenguins_frame() */
        let i,
            sstatus = null,
            o = this.options;

        /* Check if events were received & we need to update toonWindows */
        if (this._dirty) {
            // BIG TODO: faster to do _deadToons or _activeToons ?
            i = this._toons.length;
            /* calculate for squashed toons */
            while (i--) {
                if (this._deadToons.indexOf(i) >= 0) {
                    this._toons[i].calculateAssociations();
                }
            }
            this._updateToonWindows();
            i = this._toons.length;
            while (i--) {
                if (this._deadToons.indexOf(i) >= 0) {
                    this._toons[i].relocateAssociated();
                }
            }
        }

        /* Loop through all the toons *
         * NOTE: this.number is set always and the max. number of toons
         *  in the simulation to display.
         * this._toonNumber is the number of penguins *currently* active or not
         *  terminating, and can change from loop to loop.
         * If it's 0, we quit.
         * \sum{this._numbers} <-> npenguins
         * this._toons.length - this._deadToons.length <-> penguin_number
         */
        i = this._toons.length;
        while (i--) {
            /* skip dead toons */
            if (this._deadToons.indexOf(i) >= 0) {
                continue;
            }
            let toon = this._toons[i];

            if (!toon.active) {
                if (!toon.terminating) {
                    // it's done terminating and needs to be reborn.
                    toon.init();
                } else {
                    toon.hide();
                    this._deadToons.push(i);
                    this._numbers[toon.theme]--;
                }
            } else {
                /* laziness */
                let u,
                    gdata = this._theme.toonData[toon.genus];

                /* see if the toon is squashed */
                if (!((toon.data.conf & Toon.NOBLOCK) || 
                        (toon.data.conf & Toon.INVULNERABLE)) &&
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
                                                   toon.pref_direction : 
                                                   XPUtil.RandInt(2));
                                toon.makeWalker(false);
                                toon.pref_direction = -1;
                            } else {
                                /* turn into climber or bounce off */
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
                            /* splat? (33% chance if reached terminal velocity) */
                            if (o.blood && gdata.splatted &&
                                    toon.v >= toon.data.terminal_velocity &&
                                    !XPUtil.RandInt(3)) {
                                toon.setType('splatted', Toon.LEFT, Toon.DOWN);
                                toon.setAssociation(Toon.DOWN);
                                toon.setVelocity(0, 0);
                            } else {
                                /* got lucky: walk */
                                toon.direction = (toon.pref_direction > -1 ?
                                                   toon.pref_direction : 
                                                   XPUtil.RandInt(2));
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
                                            toon.setVelocity(
                                                (XPUtil.RandInt(5) + 1) * (newdir * 2 - 1),
                                                -gdata.floater.speed);
                                            // break
                                        }
                                    } else {
                                      /* Change direction *after* creating toon
                                       * to make sure that a runner doesn't get
                                       * instantly squashed... */
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
                                    toon.setType('tumbler', toon.direction, 
                                        Toon.DOWN);
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
                            let actionN = 'action%d'.format(
                                XPUtil.RandInt(this._theme.nactions[toon.genus]));
                            log('new action: ' + actionN);
                            /* If we have enough space, start the action: */
                            if (!toon.checkBlocked(actionN, Toon.DOWN)) {
                                toon.setType(actionN, toon.direction, Toon.DOWN);
                                toon.setVelocity(gdata[actionN].speed * 
                                    (2 * toon.direction - 1), 0);
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
                                    toon.setType('tumbler', toon.direction,
                                        Toon.DOWN);
                                    toon.setAssociation(Toon.UNASSOCIATED);
                                    toon.setVelocity(0, gdata.tumbler.speed);
                                } else {
                                    toon.makeFaller();
                                }
                                toon.pref_climb = false;
                            } else {
                                /* can't drift down, go sideways */
                                toon.setVelocity(toon.data.speed * 
                                    (2 * toon.direction - 1), 0);
                            }
                        } else if (toon.frame === 0) {
                            /* continue the action, or if you're finished, 
                             * loop/turn into walker */
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
                                toon.setVelocity(-xoffset - (1 - direction * 2), 
                                    0);
                                toon.advance(Toon.MOVE);
                                toon.setVelocity(0, v);
                            } else {
                                toon.direction = +!direction;
                                toon.makeFaller();
                                toon.pref_climb = false;
                            }
                        } else if (!toon.blocked(direction)) {
                            /* reached the top, start walking */
                            if (toon.offsetBlocked((2 * direction - 1) * 
                                    PENGUIN_JUMP, 0)) {
                                toon.setVelocity((2 * direction - 1) * 
                                    (PENGUIN_JUMP - 1), 0);
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
                            toon.setVelocity(XPUtil.RandInt(5) - 2, 
                                -gdata.angel.speed);
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
        // it's this._toons.length - this._deadToons.length
        /************* END xpenguins_frame() ************/


        /************* START main loop ************/
        /* If there are no toons left & 'exiting' has been signalled,
         * then we've just finished killing all the penguins.
         */
        let numActive = this._toons.length - this._deadToons.length;
        if (!numActive && this._exiting) {
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
                newp = Math.round(((o.load2 - load) * this._originalNumber) / 
                    (o.load2 - o.load1));
                newp = Math.min(this._originalNumber, Math.max(0, newp));
            } else if (load < o.load1) {
                newp = this._originalNumber;
            } else {
                newp = 0;
            }
            if (this._originalNumber !== newp) {
                this._setTotalNumber(newp);
                XPUtil.DEBUG(_("Adjusting number according to load: %d -> %d"),
                        this._toons.length - this._deadToons.length, newp);
            }
            this._cycle = 0;
        } else if (!numActive) {
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

    /*********************
     *      UTILITY      *
     *********************/
    /* Note : my connect/disconnect tracker takes ideas from shellshape 
     * extension: signals are stored by the owner, storing both the target & 
     * the id to clean up later
     */
    _connectAndTrack: function () {
        WindowListener._connectAndTrack.apply(this, arguments);
    },

    _disconnectTrackedSignals: function () {
        WindowListener._disconnectTrackedSignals.apply(this, arguments);
    }

};
/* so we can emit 'ntoons-changed' and extension will update accordingly.
 * FIXME: what about the other toggles?
 */
Signals.addSignalMethods(XPenguinsLoop.prototype);
