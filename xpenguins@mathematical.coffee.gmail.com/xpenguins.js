const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;
const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Meta     = imports.gi.Meta;
const Shell    = imports.gi.Shell;
const Signals  = imports.signals;

const Main = imports.ui.main;

const Gettext = imports.gettext.domain('xpenguins');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Theme  = Me.imports.theme;
const ThemeManager = Me.imports.themeManager;
const Toon   = Me.imports.toon;
const WindowClone = Me.imports.windowClone;
const WindowListener = Me.imports.windowListener;
const XPUtil = Me.imports.util;

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
    let list = Me.imports.windowListener.getCompatibleOptions(blacklist);
    /* enable everything else by default */
    let defOpts = XPenguinsLoop.prototype.defaultOptions();
    for (let opt in defOpts) {
        if (defOpts.hasOwnProperty(opt) && !list.hasOwnProperty(opt)) {
            list[opt] = !blacklist;
        }
    }
    list.rectangularWindows = blacklist || false; // for now no shaped windows
    /* see if we can do load averaging */
    list.loadAveraging = XPUtil.loadAverage() >= 0;
    if (blacklist) {
        list.loadAveraging = !list.loadAveraging;
    }
    let load = XPUtil.loadAverage();
    list.loadAveraging = blacklist ? load < 0 : load >= 0;
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
    __proto__: WindowListener.WindowListener.prototype,

    _init: function (i_options) {
        WindowListener.WindowListener.prototype._init.apply(this);

        /* set options */
        let options = this.defaultOptions(),
            WLopt  = WindowListener.WindowListener.prototype.options;
        /* copy over window-listener options */
        for (let opt in WLopt) {
            if (WLopt.hasOwnProperty(opt)) {
                options[opt] = WLopt[opt];
            }
        }
        options.onAllWorkspaces = false;
        options.verbose = true;
        /* copy over custom options */
        for (let opt in i_options) {
            if (i_options.hasOwnProperty(opt) && options.hasOwnProperty(opt)) {
                options[opt] = i_options[opt];
            } else {
                XPUtil.warn('Warning: unknown option %s, ignoring'.format(opt));
            }
        }
        this.options = options;
        /* when this is non-0, the animation is playing.
         * If the animation is paused but not stopped, _playing is
         * still true.
         */
        this._playing = 0;
        this._numbers = {};
        this._relaunch = false;
    },

    /***************************************
     * OVERRIDDEN WINDOWLISTENER FUNCTIONS *
     ***************************************/

    /* Note: we don't update the winow region here, we do it in _frame. */
    _onWindowEvent: function (eventName) {
        this.LOG('[XP] _onWindowEvent %s', eventName);
        this._dirty = true;
    },

    /* Have to override get_workspace to incorporate a movable window :/ */
    get_workspace: function () {
        XPUtil.DEBUG('[XP] get_workspace: %d', this._XPenguinsWindow.get_workspace().index());
        return this._XPenguinsWindow.get_workspace();
    },

    /* Initialise all variables & load themes & initialise toons.
     * Stuff that has to get reset whenever the timeline restarts.
     * xpenguins_start, main.c
     */
    start: function () {
        this.LOG('[XP] START');

        /* signals */
        this._sleepID = null;
        //@@ this._playing = 0;
        this._relaunch = false;

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

        this._dirty = true;
        
        /* Laziness */
        let opt = this.options;
        /* If they set onAllWorkspaces but are running in a window,
         * unset onAllWorkspaces
         */
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
                this.LOG(_("Warning: cannot detect load averages on this system"));
                opt.load1 = -1;
                opt.load2 = -1;
            }
        }
        opt.load_cycles = opt.load_check_interval / opt.sleep_msec;

        /* Set up the window we're drawing on, if it hasn't been set already
         * via setWindow.
         * _XPenguinsWindow is the *actor*.
         */
        if (!this._XPenguinsWindow) {
            this.setWindow(global.stage);
        }

        /* set up god mode */
        if (opt.squish) {
            this.toggleGodMode(true);
        }

        /* set up toons */
        this._initToons();

        /* Call parent's start */
        WindowListener.WindowListener.prototype.start.apply(this);

        /* actually start */
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT,
            this.options.sleep_msec, Lang.bind(this, this._frame));
    },

    /* when you send the stop signal to xpenguins (through the toggle)
     * Note we do not call parent's stop here because that stops
     * immediately and we do not wish to stop immediately.
     * (although, we no longer care about listening to events at this point?)
     */
    stop: function (immediately) {
        this.LOG('[XP] STOP');
        this._onInterrupt(immediately);
    },

    /* when you really want to kill xpenguins
     * (ie exit sequence has finished)
     * xpenguins_exit() and ToonFinishUp in toon_end.c
     */
    exit: function () {
        this.LOG('[XP] exit');
        WindowListener.WindowListener.prototype.stop.apply(this);
        let i;

        if (this._sleepID) {
            Mainloop.source_remove(this._sleepID);
        }
        if (this._XPenguinsWindowDestroyedID && this._XPenguinsWindow.actor) {
            this._XPenguinsWindow.actor.disconnect(this._XPenguinsWindowDestroyedID);
            this._XPenguinsWindowDestroyedID = null;
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

        /* Note: we *don't* destroy the window clone so that it may be
         * re-used for the next run without having to re-assign the window
         * we want to run in. 
         */
        //this._XPenguinsWindow.destroy();

        /* destroy theme */
        if (this._theme) {
            this._theme.destroy();
        }

        /* delete references to big objects to help free up memory */
        delete this._toonGlobals;
        delete this._theme;
        this._toons = [];

        /* tell everyone we've finished */
        this.emit('stopped');
    },

    /* pauses the timeline & temporarily stops listening for events,
     * *except* for owner.connect(eventName) which sends the resume signal.
     */
    pause: function (hide, subject, eventName, cb) {
        /* pauses the window tracker */
        WindowListener.WindowListener.prototype.pause.call(this, subject, eventName, cb);
        if (hide) {
            this._hideToons();
        }
    },

    /* resumes timeline, connects up events */
    resume: function () {
        /* resume window tracker */
        WindowListener.WindowListener.prototype.resume.apply(this);
        if (this._toons[0] && !this._toons[0].visible) {
            this._showToons();
        }
        this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT,
            this.options.sleep_msec, Lang.bind(this, this._frame));
    },

    /* called when configuration is changed, handles on-the-fly changes */
    changeOption: function (propName, propVal, emit) {
        /* disallowed options changes */
        if (propName === 'onAllWorkspaces' && propVal && !this._onDesktop) {
            XPUtil.warn(_("Cannot use the on all workspaces option if running in a window"));
            return;
        }

        /* additional configuration to the big if loop below */
        if (propName === 'onAllWorkspaces') {
            this._XPenguinsWindow.setOnAllWorkspaces(propVal);
        }
        /* override the window listener */
        if (propName === 'ignoreMaximised' && propVal) {
            this.options.ignoreMaximised = propVal;
            let oldStack = this.options.stackingOrder;
            this.options.stackingOrder = (!this._onDesktop || opt.ignoreMaximised);
            if (this.options.stackingOrder !== oldStack) {
                this.changeOption('stackingOrder', this.options.stackingOrder);
            }
        /* Window tracking-specific options */
        } else if (WindowListener.WindowListener.prototype.options.hasOwnProperty(propName)) {
            WindowListener.WindowListener.prototype.changeOption.call(this, propName, propVal);
            this._onWindowEvent('changeOption');
        } else {
        /* XPENGUIN-specific options. */
            this.LOG('changeOption[XP]: %s = %s', propName, propVal);
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
                } else if (propName === 'sleep_msec') {
                    /* have to remove the _frame & re-add. */
                    this.hotRestart();
                } else if (propName === 'load1' && propVal < 0) {
                    /* restore original toons */
                    this.emit('load-averaging-end');
                    if (this._toons.length - this._deadToons.length !== this._originalNumber) {
                        this._setTotalNumber(this._originalNumber);
                    }
                }
                /* Otherwise, things like angels, blood: these things can just
                 * be set and no recalculating of signals etc or extra action
                 * need be done.
                 */
                /* if it's currently sleeping, wake it up to process the change */
                if (this._sleepID) {
                    Mainloop.source_remove(this._sleepID);
                    this._sleepID = null;
                    this.resume();
                }
            }
        } // whether xpenguins or window-listener option
        if (emit) {
            this.emit('option-changed', propName, propVal);
        }
    },

    destroy: function () {
        WindowListener.WindowListener.prototype.destroy.call(this);
        this.exit();
    },
    
    /* connects up events required to maintain toonWindows as an accurate
     * snapshot of what the windows on the workspace look like
     * We override it to add windows for the xpenguins window.
     */
    _connectSignals: function () {
        /* Extra signals to add if we're running XPenguins in a window:
         * window changes workspace
         * window is closed (stop window listener)
         * window is minimized (pause) or unminimized (resume)
         */
        if (!this._onDesktop) {
            this._listeningPerWindow = true;
            this.connectAndTrack(this._XPenguinsWindow, this._XPenguinsWindow.meta_window,
                'notify::minimized', Lang.bind(this, this._onXPenguinsWindowMinimized));
            this.connectAndTrack(this._XPenguinsWindow, this._XPenguinsWindow.meta_window,
                'workspace-changed', Lang.bind(this, this._onXPenguinsWindowWorkspaceChanged));
        } else {
        /* pause on overview show, if we're on the desktop */
            this.connectAndTrack(this, Main.overview, 'showing',
                Lang.bind(this, function () {
                    this.pause(true, Main.overview, 'hiding');
                })
            );
        }
        WindowListener.WindowListener.prototype._connectSignals.apply(this, arguments);
    },

    _disconnectSignals: function () {
        WindowListener.WindowListener.prototype._disconnectSignals.apply(this, arguments);
        this.disconnectTrackedSignals(this._XPenguinsWindow);
    },

    // have to override updateWindows to take into account maximised windows.
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
            /* sort by monitor ... ? */
            winList.sort(function (a, b) { 
                return a.get_monitor() - b.get_monitor();
            });
        }

        /* filter out desktop & nonvisible/mapped windows windows */
        winList = winList.filter(Lang.bind(this, function (win) {
            return (win.get_compositor_private().mapped &&
                    win.get_compositor_private().visible &&
                    win.get_window_type() !== Meta.WindowType.DESKTOP);
        }));

        /* If running in a window: loop through until we hit the window we're
         * running in.
         *
         * Otherwise, sort windows BY MONITOR.
         * Then ignore all windows behind a maximised one.
         */
        let win, curMon, i = winList.length;
        while (i--) {
            win = winList[i];
            if (!this._onDesktop && win === this._XPenguinsWindow.meta_window) {
                break;
            }
            if (this._onDesktop && this.options.ignoreMaximised && 
                    win.get_maximized() ===
                    (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL)) {
                /* look for the next monitor */
                curMon = win.get_monitor();
                while (i--) {
                    if (winList[i].get_monitor() !== curMon) {
                        ++i; /* for the loop */
                        break;
                    }
                }
                if (i <= 0) { /* no windows left */
                    break;
                }
                continue;
            }
            this.windowRegion.addRectangle(winList[i].get_outer_rect());
        }
        this._dirty = false;
    },


    /****************
     * Initialising *
     ****************/
    _initToons: function () {
        this.LOG('[XP] _initToons');
        /* set up global vars to feed in to the toons */
        this._toonGlobals = {
            box               : this._XPenguinsWindow.get_box(),
            toonData          : this._theme.toonData,
            toon_windows      : this.windowRegion,
            edge_block        : this.options.edge_block,
            max_relocate_up   : this.options.max_relocate_up,
            max_relocate_down : this.options.max_relocate_down,
            max_relocate_right: this.options.max_relocate_right,
            max_relocate_left : this.options.max_relocate_left
        };

        /* add ToonDatas to the stage so clones can be added properly */
        this._addToonDataToStage(ALL);

        /* temporarily set _playing = true so .setNumber will initialise toons.
         * Use default amount if none specified by now. A bit of a hack.
         */
        let playing = this._playing,
            i = this.themeList.length,
            oldNumbers = this._numbers;
        this._playing = true;
        this._numbers = {};
        while (i--) {
            this.LOG('setThemeNumbers(%s, %d)', this.themeList[i],
                oldNumbers[this.themeList[i]]);
            this.setThemeNumbers(this.themeList[i],
                oldNumbers[this.themeList[i]] || -1);
        }
        this._playing = playing;
    },

    /* add ToonDatas to the stage so clones can be added properly */
    _addToonDataToStage: function (theme) {
        this.LOG('Add toon data to stage');
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
                    gdata[type].texture.hide();
                    Main.uiGroup.add_actor(gdata[type].texture);
                }
            }
        }
    },

    /*******************
     *  PUBLIC METHODS *
     *******************/
    /* Use this when you want to remove _frame() from the Mainloop and
     * instantly add it back in.
     * For example when sleep_msec changes you have to remove _frame and add
     * it back in at the appropriate new sleep_msec.
     */
    hotRestart: function () {
        this._relaunch = true;
    },

    /* returns a set of default options (wanted to be able to call it as a
     * static method)
     */
    defaultOptions: function () {
        return {
            /* Load average checking: kill penguins if load is too high
               Start killing toons when the 1-min averaged system load
                exceeds load1; when it exceeds load2  kill them  all.
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
            squish : false, // squish toons with the mouse.

            /* maximum amount a window can move for the penguin to still
             * cling on */
            max_relocate_up:    16,
            max_relocate_down:  16,
            max_relocate_left:  16,
            max_relocate_right: 16,

            sleep_msec : 0, // delay in milliseconds between each frame.

            /* WINDOW LISTENER OPTIONS (defined in that code) */
            /*
            ignorePopups : false, // ignore popup windows (right-click menus,
                                  // tooltips, ...). Ie anything firing 'map'
                                  // but not 'window-added'.
            onAllWorkspaces: false, // what happens when we switch workspaces.
            stackingOrder: true
            verbose: true
            // possible efficiency gain (really, don't bother changing it).
            // Technically in order of most efficient to least:
            // RECALC.END, RECALC.PAUSE, RECALC.ALWAYS.
            recalcMode: RECALC.ALWAYS,
            */
        };
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
        this.LOG('[XP] setThemes');
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
    setThemeNumbers: function (inames, ns, silent) {
        this.LOG('[XP] setThemeNumbers');
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
            this.LOG(' .. %s: %d', name, n);
            if (!this._theme.hasTheme(name)) {
                if (n) {
                    this._theme.appendTheme(name);
                    this._addToonDataToStage(name);
                } else {
                    continue;
                }
            }
            if (this.themeList.indexOf(name) < 0) {
                this.themeList.push(name);
            }
            this._originalNumber -= (this._numbers[name] || 0);
            // if n is <0, use default.
            if (n < 0) {
                n = this._theme.getTotalForTheme(name);
            } else if (n === 0) {
                this.themeList.splice(this.themeList.indexOf(name), 1);
            }
            this.LOG(' .. calling this._setNumber(%s, %d)', name, n);
            this._setNumber(name, n, silent);
            /* for load averaging: store a copy of the originals */
            this._originalNumber += this._numbers[name];
        }
        /* if it's currently sleeping, wake it up to process the change */
        if (this._sleepID) {
            Mainloop.source_remove(this._sleepID);
            this._sleepID = null;
            this.resume();
        }
    },

    /* call this to set XPenguins running in the specified window */
    setWindow: function(winActor) {

        this._onDesktop = !(winActor instanceof Meta.WindowActor);
        if (this.options.onAllWorkspaces && !this._onDesktop) {
            XPUtil.warn(_("Warning: onAllWorkspaces is TRUE but running in a window, setting onAllWorkspaces to FALSE"));
            this.changeOption('onAllWorkspaces', false, true);
        }
        this.options.stackingOrder = (!this._onDesktop || this.options.ignoreMaximised);

        /* make a clone */
        this._XPenguinsWindow = new WindowClone.XPenguinsWindow(winActor,
            this.options.onAllWorkspaces);
        /* We track for the host window being destroyed even if XPenguins is
         * not running. Because then we have to set the window back to the
         * desktop.
         */
        this._XPenguinsWindowDestroyedID = this._XPenguinsWindow.actor.connect(
            'destroy',
            Lang.bind(this, this._onXPenguinsWindowDestroyed)
        );


        /* Note: we can't just call stop then start instantaneously, because
         * the current instance of _frame will return true (since _playing
         * is now the new instance) and the new instance of _frame will also
         * be added, resulting in a very fast animation (???)
         * So we use the _relaunch to wait until the old _frame expires
         * before re-adding it again.
         */
        if (this._playing) {
            /* RESTARTING STUFF */
            this._toonGlobals.box = this._XPenguinsWindow.get_box();
            this._updateWindows();
            for (let i = 0; i < this._toons.length; ++i) {
                if (this._toons[i].active && !this._toons[i].terminating) {
                    this._toons[i].init();
                }
            }
            this.hotRestart();
        }
    },

    toggleGodMode: function (onoff) {
        this.LOG('!!!!!!!!!! toggling GOD MODE !!!!!!!!!!');
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


    /*******************
     * PRIVATE METHODS *
     *******************/

    /* sets the total number of penguins in the entire animation to n,
     * basically setting the # toons approx. equal for each theme
     * (it was easier than trying to *remove* an approx. equal number
     * for each theme, which could kill some themes).
     */
    _setTotalNumber: function (n, silent) {
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
        this.LOG('_setNumber(%s, %d)', name, n);

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
        this.LOG(' .. current: %d. requested: %d', current, n);
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
             */
            let left = (current - n);
            for (let i = 0; i < this._toons.length && left; ++i) {
                this.LOG('toon %d: theme: %s genus: %s active: %s', i,
                        this._toons[i].theme, this._toons[i].genus,
                        this._toons[i].active);
                if (this._toons[i].theme === name) {
                    if (this._toons[i].active) {
                        left--;
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

    _onXPenguinsWindowMinimized: function () {
        this.LOG('..............notify::minimized')
        // UPTO: minimized && !paused already!
        if (this._XPenguinsWindow.meta_window.minimized) {
            this.pause(true, this._XPenguinsWindow.meta_window, 'notify::minimized',
                    Lang.bind(this, this._onXPenguinsWindowMinimized));
            // y u no pause?
            return false;
        }
        return true; // resume.
    },

    /* hide if it's not the active workspace.
     * This is equivalent to us switching away from xpenguin window's workspace.
     */
    _onXPenguinsWindowWorkspaceChanged: function (metaWin, oldWorkspace) {
        this.LOG('..............XPenguins window switched workspace')
        //UPTO
        // reassign get_workspace and fire this._onWorkspaceChanged
        // Hmm - get_workspace is guaranteed to be current anyhow since
        // this is only fired if we are using XPenguinsWindow as a window.
        this._onWorkspaceChanged.call(this, null,
            global.screen.get_active_workspace_index());
    },

    /* stop and send a signal */
    _onXPenguinsWindowDestroyed: function () {
        if (this.is_playing()) {
            this.stop(true);
            this.emit('xpenguins-stopped');
        }
        if (this._XPenguinsWindow.actor && this._XPenguinsWindowDestroyedID) {
            this._XPenguinsWindow.actor.disconnect(this._XPenguinsWindowDestroyedID);
            this._XPenguinsWindowDestroyedID = null;
        }
        /* destroy this._XPenguinsWindow */
        this._XPenguinsWindow.destroy();
        delete this._XPenguinsWindow;
        /* Indicate to the extension that the window has changed */
        this.emit('xpenguins-window-killed');
    },

    /* stop xpenguins, but play the exit sequence */
    _onInterrupt: function (justExit) {
        this.LOG(_("Interrupt received: Exiting."));
        /* If we're sleeping then quit immediately */
        if (this._sleepID) {
            Mainloop.source_remove(this._sleepID);
            this._sleepID = null;
            this.exit();
        } else if (justExit) {
        /* If emergency exit requested then quit immediately */
            this.exit();
        } else {
            /* tell the loop to start the exit sequence */
            this._exiting = true;
            this._setTotalNumber(0, true); // don't emit signal or sliders go to 0.
        }
    },

    /**************** GOD MODE **************/
    _addSquishEvents: function (toon) {
        if (toon.actor.get_reactive()) {
            /* already has squish events. */
            return;
        }
        this.LOG('adding squish events');
        toon.actor.set_reactive(true);
        /* kill toon on click, change cursor to "smite" icon on mouseover. */
        // FIXME: "smite" icon is currently a hand. Make it something
        // suitably god-like, like a lightning bolt :P
        this.connectAndTrack(toon, toon.actor,
            'button-press-event',
            Lang.bind(this, this._onSmite, toon));
        this.connectAndTrack(toon, toon.actor,
            'enter-event', function () {
                global.set_cursor(Shell.Cursor.POINTING_HAND);
                return true; /* event fully handled, do not pass on */
            });
        this.connectAndTrack(toon, toon.actor,
            'leave-event', function () {
                global.unset_cursor();
                return true; /* event fully handled, do not pass on */
            });
    },

    _removeSquishEvents: function (toon) {
        this.LOG('removing squish events');
        toon.actor.set_reactive(false);
        this.disconnectTrackedSignals(toon);
    },

    _onSmite: function (actor, event, toon) {
        this.LOG('OWWWIEEE!');
        /* Not in Clutter-gir. button 1: PRIMARY, 2: MIDDLE, 3: SECONDARY */
        if (event.get_button() !== 1) {
            return false; /* pass on the event */
        }
        /* Event coordinates are relative to the stage that received the event,
         * and can be transformed into actor-relative coordinates using
         * actor.transform_stage_point().
        let [stageX, stageY] = event.get_coords();
        this.LOG('SMITE at %d, %d'.format(stageX, stageY));
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
            toon.associate = Toon.UNASSOCIATED;
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
            if (this._toons[i].active) {
                /* sometimes the last frame of the exploded toon is left on
                 * screen */
                this._toons[i].show();
            }
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
        /* requested to exit and re-add the timeout
         * (for example when the sleep_msec changes)
         */
        if (this._relaunch) {
            this._relaunch = false;
            this._playing = Clutter.threads_add_timeout(GLib.PRIORITY_DEFAULT,
                this.options.sleep_msec, Lang.bind(this, this._frame));
            return false;
        }
        /* sometimes the rug is pulled from under our feet - xpenguins is
         * stopped and there's one extra _frame() call
         */
        if (!this._playing || this._sleeping) {
            return false;
        }
        /* xpenguins_frame() */
        let i,
            sstatus = null,
            o = this.options;

        /* Check if events were received & we need to update toonWindows */
        if (this._dirty) {
            i = this._toons.length;
            /* calculate for squashed toons */
            while (i--) {
                if (this._deadToons.indexOf(i) >= 0) {
                    this._toons[i].calculateAssociations();
                }
            }
            this._updateWindows();
            i = this._toons.length;
            while (i--) {
                if (this._deadToons.indexOf(i) >= 0) {
                    this._toons[i].relocateAssociated();
                }
            }
            /* refresh the snapshot of where XPenguinsWindow is (just
             * calculate once for all toons per frame) */
            if (!this._onDesktop) {
                this._toonGlobals.box = this._XPenguinsWindow.get_box();
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
                    toon.init();
                    /*
                    if (toon.blocked(Toon.HERE)) {
                        toon.active = false;
                        toon.hide();
                    } else {
                        toon.show();
                    }
                    */
                } else {
                    toon.hide();
                    this._deadToons.push(i);
                    this._numbers[toon.theme]--;
                }
            } else {
                /* laziness */
                let u,
                    gdata = this._theme.toonData[toon.genus],
                    box = this._XPenguinsWindow.get_box();

                /* see if the toon is squashed */
                if (!((toon.data.conf & Toon.NOBLOCK) ||
                        (toon.data.conf & Toon.INVULNERABLE)) &&
                        toon.blocked(Toon.HERE)) {
                    this.LOG('EXPLODING');
                    if (o.blood && gdata.squased) {
                        toon.setType('squashed', toon.direction, Toon.HERE);
                    } else if (gdata.explosion) {
                        toon.setType('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = false;
                    }
                    toon.setVelocity(0, 0);
                    toon.associate = Toon.UNASSOCIATED;
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
                                toon.associate = Toon.DOWN;
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
                                            toon.associate = Toon.UNASSOCIATED;
                                            toon.setVelocity(
                                                (XPUtil.RandInt(5) + 1) * (newdir * 2 - 1),
                                                -gdata.floater.speed
                                            );
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
                                    toon.associate = Toon.UNASSOCIATED;
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
                                XPUtil.RandInt(this._theme.nactions[toon.genus])
                            );
                            this.LOG('new action: ' + actionN);
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
                                    toon.associate = Toon.UNASSOCIATED;
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
                        if (toon.y < box.top) {
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
                        if (toon.y < box.top) {
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
                            toon.associate = Toon.UNASSOCIATED;
                        }
                    /* angel */
                    } else if (toon.type === 'angel') {
                        /* deactivate if offscreen */
                        if (toon.y < box.top - toon.data.height) {
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
            this.LOG(_("Done."));
            this.exit();
            return false;
        }
        if (this._exiting) {
            this.LOG('.');
        }

        /* check the CPU loading */
        if (o.load1 >= 0 && !this._exiting && this._cycle > o.load_cycles) {
            let newp,
                signal,
                load = XPUtil.loadAverage();

            if (o.load2 > o.load1) {
                newp = Math.round(((o.load2 - load) * this._originalNumber) /
                    (o.load2 - o.load1));
                newp = Math.min(this._originalNumber, Math.max(0, newp));
                signal = (newp === this._originalNumber ? 'load-averaging-end' :
                    (newp === 0 ? 'load-averaging-kill' : 'load-averaging-start'));
            } else if (load < o.load1) {
                newp = this._originalNumber;
                signal = 'load-averaging-end';
            } else {
                newp = 0;
                signal = 'load-averaging-kill';
            }
            if (this._toons.length - this._deadToons.length !== newp) {
                this.LOG(_("Adjusting number according to load: %d -> %d"),
                        this._toons.length - this._deadToons.length, newp);
                this._setTotalNumber(newp);
                this.emit(signal);
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
                    this._sleepID = null;
                    return false;  // return false to call just once.
                }));
        }
        ++this._cycle;

        return this._playing;
    } // _frame
};
Signals.addSignalMethods(XPenguinsLoop.prototype);
