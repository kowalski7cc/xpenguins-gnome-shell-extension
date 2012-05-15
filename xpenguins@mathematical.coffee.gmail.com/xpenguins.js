const Clutter = imports.gi.Clutter;

// TODO: add to util file.
/* Get the 1-min averaged system load on linux systems - it's the
 * first number in the /proc/loadavg pseudofile. Return -1 if not
 * found. */
try {
    const GTop = imports.gi.Gtop;
    function loadAverage() {
        let loadavg = new GTop.glibtop_loadavg;
        GTop.glibtop_get_loadavg(loadavg);
        return loadavg.loadavg[0];
    };
} catch (err) {
    function loadAverage() {
        let load=-1;
        try {
            let str = Shell.get_file_contents_utf8_sync('/proc/loadavg');
            load = parseFloat(str.split(' ')[0]);
        } catch(err) {
            load = -1;
        }
        return load;
    };
};

/************************
 * X penguins main loop *
 ************************/
function XPenguinsLoop() {
    this._init.apply(this, arguments);
};

XPenguinsLoop.prototype = {
    log: function(msg) {
        if ( this.DEBUG ) {
            global.log(msg);
            print(msg);
            log(msg);
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
    defaultOptions: {
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
        load_check_interval : 5000000, /* 5s between load average checks */
        load_cycles, /* number of frames between load average checks */
        load1 : -1.0, /* Start killing penguins if load reaches this amount */
        load2 : -1.0, /* All gone by this amount (but can come back!) */


        /* more settings */
        /* Number of penguins to start with up to a max of PENGUIN_MAX. Default defined by theme. */
        nPenguins : -1,
        // What theme to use. default Penguins
        themes : [],

        /* flags */
        /* Do not show any cherubim flying up to heaven when a toon gets squashed. */
        angels : true, 
        /* Do not show gory death sequences */
        blood : true, 
        /* Ignore maximised windows */
        ignoreMaximised : true,
        /* Ignore popup windows */
        ignorePopups : false,
        /* Enable the penguins to be squished using any of the mouse buttons.  */
        /* Note that disables any existing function of the mouse buttons. */
        squish : false,


        /* maximum amount a window can move and the penguin can still cling on */
        // set in main.c
        max_relocate_up:    16,
        max_relocate_down:  16,
        max_relocate_left:  16,
        max_relocate_right: 16,

        // possibly unnecessary/can't be implemented/depreciate
        sleep_usec : 0, // <-- delay in milliseconds between each frame.
        /* Toons  regard  all  windows  as  rectangular.  */
        /* Possible slight speedup but if you use a window manager with shaped windows */
        /*  your toons might look like they're walking on thin air. */
        rectangularWindows : false,
        /* Load all available themes and run them simultaneously */
        all : false
    },

        // TODO: if xpenguins_active then do something.
    set_themes: function( themeList ) {
        this.options.themes = themeList;
    },

    _init: function(i_options) {
        let options = this.defaultOptions;
        /* copy over custom options */
        for ( opt in i_options ) {
            // warn of unknown options
            if ( opt in options ) {
                this.warn('Warning: unknown option %s, ignoring'.format(opt));
            } else {
                options[opt] = i_options[opt];
            }
        }

        /* Private */
        this.options = options;
        this._theme = null;
        this._active = false;
        this._penguins = [];

        /* See if load averaging will work */ 
        if ( this.options.load1 >= 0 ) {
            let load = loadAverage();
            if ( load < 0 ) {
                this.options.log(_("Warning: cannot detect load averages on this system\n"));
                this.options.load1 = -1;
                this.options.load2 = -1;
            } else {
                this.options.load_cycles = this.options.load_check_interval/this.options.sleep_usec;
            }
        }

        /* start timeline (??) */
        /* NOTE: GNOME 3.2 has Clutter-1.0, and no set_repeat_count.
         * --> do timeline.set_loop(true);
         * in GNOME 3.4, use timeline.set_repeat_count(...);
         */
        let timeline = new Clutter.Timeline();
        this.timeline.set_loop(true);
    },

    /* when xpenguins is stopped (for example to restart it) */
    stop: function() {
        if ( !this.timeline.is_playing() ) 
            return;

        // TODO: rewind/this.cleanUp() ?
        this.timeline.stop();
    },

    /* start the main xpenguins loop: main.c 
     * init() should have been called by now.
     */
    start: function() {
        if ( this.timeline.is_playing() ) 
            return;
        //TODO: run .init() here if we detect it hasn't been?
        this.timeline.start();
    },

    /* load themes & initialise theme-dependent vars & toons
     * should be called before start()
     * xpenguins_start
     */
    init: function() {
        /* Laziness (can do with(this.options) { ... } too) */
        let opt = this.options;

        /* Load theme into this._theme */
        this._theme = new Theme( this.options.themes );
        // TODO: check that it loaded properly

        /* theme-specific options */
        if ( !opt.sleep_usec ) {
            opt.sleep_usec = 1000*this._theme.delay;
        }
        if ( opt.nPenguins < 0 ) {
        // TODO: initially set the slider to the default from the theme
            opt.nPenguins = this._theme.total;
        }

        /* TODO: set up global variables: ToonConfigure, toonwindows, ...
        ToonConfigure(TOON_SIDEBOTTOMBLOCK);
        ToonConfigure(TOON_CATCHSIGNALS);
        ToonConfigure(TOON_SQUISH);
        */

        /* set the genus of each penguin, respecting the ratios in theme.number? */
        /* Xpenguins makes one of each type, & then give the requested number
         * per genus, so if your genus is at the end and you run out of penguins,
         * then you miss out on all but one.
         */
        let genus_numbers = theme.number.map(function(i) { return Math.floor(i/theme.total*opt.nPenguins) });
        let leftover = opt.nPenguins - genus_numbers.reduce(function (x,y) { x+y }); // note: guaranteed <= theme.ngenera
        while ( leftover ) { // genera 0 to leftover-1 get 1 extra.
            genus_numbers[--leftover] += 1;
        }
        let j=0;
        for ( let i=0; i<genus_numbers.length; ++i ) {
            while ( genus_numbers[i] ) {
                this._penguins[j++].genus = i;
                genus_numbers[i]--;
            }
        }

        /* initialise penguin */
        for ( let i=0; i<this._penguins.length; ++i ) {
            this._penguins[i].init();
        }

        // TODO: what is this for, replace by this.timeline.is_playing() ?
        this._active = true;

        /* Set up timeline/loop */
        // Could use Mainloop instead of a Clutter.Timeline?

        /* Main loop */
        this._newFrameId = this.timeline.connect('new-frame',
                function() {
                    /* insert main loop here? */
                    // xpenguins_frame() ?
                }
        );
        let interupts = false;
        let cycle=0;
        while ( let frames_active = xpenguins_frame() || !interupts ) {
            if ( interupts && this._DEBUG ) {
                this.log('.');
            }
      
            if (ToonSignal()) {
                if (++interupts > 1) {
                    break;
                } 
                this.log(_('Interrupt received: Exiting.'));
                ToonConfigure(TOON_EXITGRACEFULLY);
                this.set_number(0);
            
            } else if (!interupts && cycle > this.load_cycles && this.load1 >= 0.0) {
                let load = loadAverage();
                let newp;
                if ( this.load2 > this.load1 ) {
                    newp = Math.round(((this.load2-load)*this.nPenguins)/(this.load2-this.load1));
                    // TODO: change to max/min?
                    if ( newp > this.nPenguins ) {
                        newp = this.nPenguins;
                    } else if ( newp < 0 ) {
                        newp = 0;
                    }
                } else if ( load < this.load1 ) {
                    newp = this.nPenguins;
                } else {
                    newp = 0;
                }
        
                if ( this.nPenguins != newp ) {
                    this.set_number(newp);
                }
        
                this.log(_('Adjusting number according to load'));
                cycle = 0;
            } else if (!frames_active) {
                /* No frames active! Hybernate for 5 seconds... */
                this.sleep(this.load_check_interval);
                cycle = this.load_cycles;
            }
            this.sleep(this.sleep_usec);
            ++cycle;
        }
        this.log(' Done.');
        this.exit();
    }, // start

    _frame: function() {
        // one frame of the xpenguins iteration.
    },

    set_number: function(n) {
        if ( !this._xpenguins_active ) {
            return;
        }
        // want to spawn more penguins
        if ( n > this.nPenguins ) {
            if ( n > this.PENGUIN_MAX ) {
                n = PENGUIN_MAX;
            }

            for ( let i=this.nPenguins; i<n; i++ ) {
                this.init_penguin();
                this._penguins[i].active = true;
            }
            this.nPenguins = n;

        } else if (n < this.nPenguins) {
            if (n < 0) {
                n = 0;
            }
            for (let i = n; i < this.nPenguins; i++) {
                  // Kill off excess penguins
                if ( this._penguins[i].active ) {
                    /*
                    ToonData *gdata = penguin_data[penguin[i].genus];
                    // gdata[PENGUIN_EXIT]
                    if ( this.blood && HAS_EXIT_ANIM ) {
                        ToonSetType(penguin+i, PENGUIN_EXIT,
                          penguin[i].direction, TOON_DOWN);
                    } else if ( HAS_EXPLOSION ) {
                        ToonSetType(penguin+i, PENGUIN_EXPLOSION,
                          penguin[i].direction, TOON_HERE);
                    } else {
                        this._penguins[i].active = false;
                    }
                    */
                    this.penguins[i].terminating = true;
                }
            }
          /*
          ToonErase(this._penguins, this.nPenguins);
          ToonDraw(this._penguins, this.nPenguins);
          ToonFlush();
          */
        }
    },

};
