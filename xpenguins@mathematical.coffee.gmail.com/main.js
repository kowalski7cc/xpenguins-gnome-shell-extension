/* Main loop. main.c */

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
function XpenguinsLoop() {
    this._init.apply(this, arguments);
};

XpenguinsLoop.prototype = {
    _log: function(msg) {
        if ( this._DEBUG ) {
            global.log(msg);
            log(msg);
        }
    },

    _init: function() {
        // NOTE: can use multiple themes.
        /* variables */  
        this._DEBUG = true;

        this.PENGUIN_MAX = 256;


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
        this.load_check_interval = 5000000; /* 5s between load average checks */
        this.load_cycles; /* number of frames between load average checks */
        this.load1 = -1.0; /* Start killing penguins if load reaches this amount */
        this.load2 = -1.0; /* All gone by this amount (but can come back!) */
        this.interupts = 0;

        /* more settings */
        this.sleep_usec = 0; // <-- delay in milliseconds between each frame.
        // Number of penguins to start with up to a max of 256. Default defined by theme.
        this.nPenguins = -1;
        // What theme to use. default Penguins
        this.themes = ['Penguins'];
        // where the themes are stored
        this.config_dir = GLib.build_filenamev([metadata.path, 'themes']);

        /* flags */
        // Do not show any cherubim flying up to heaven when a toon gets squashed.
        this.angels = true; 
        // Do not show gory death sequences
        this.blood = true; 
        // Ignore maximised windows
        this.ignoreMaximised = true;
        // Ignore popup windows
        this.ignorePopups = false;
        // Toons  regard  all  windows  as  rectangular. 
        // Possible slight speedup but if you use a window manager with shaped windows
        //  your toons might look like they're walking on thin air.
        this.rectangularWindows = false;
        // Enable the penguins to be squished using any of the mouse buttons. 
        // Note that this disables any existing function of the mouse buttons.
        this.squish = false;
        // Load all available themes and run them simultaneously
        this.all = false;


        /* Private */
        this._theme = null;
        this._xpenguins_active = false;
        this._penguins = [];

        /* TODO:
         * - list themes + theme info
         * - theme installer
         *
         * - this.window
         */


        /* Set settings */
        // NOTE: do I really need the arguments? can get it anyway...
        this.ignore_popups();
        this.set_number( this.nPenguins );

        /* Load theme into this._theme and set theme defaults */
        if ( this.all ) {
            this.themes = ThemeManager.list_themes();
        } 
        this._theme = new Theme( this.themes );

        if ( !this.sleep_usec ) {
            this.sleep_usec = 1000*this._theme.delay;
        }

        /* set up load averages */
        if ( this.load1 >= 0 ) {
            let load = loadAverage();
            if ( load < 0 ) {
                this._log(_("Warning: cannot detect load averages on this system\n"));
                this.load1 = -1;
                this.load2 = -1;
            } else {
                this.load_cycles = this.load_check_interval/this.sleep_usec;
            }
        }

  /* Send pixmaps to X server */
  error_message = xpenguins_start(display_name);

  /* We want npenguins to represent the full complement of penguins;
   * penguin_number may change if the load gets too high */
  if (npenguins <= 0) {
    npenguins = penguin_number;
  }

        ToonConfigure(TOON_CATCHSIGNALS);

        /* Main loop */
        let interupts = false;
        let cycle=0;
        while ( let frames_active = xpenguins_frame() || !interupts ) {
            if ( interupts && this._DEBUG ) {
                this._log('.');
            }
      
            if (ToonSignal()) {
                if (++interupts > 1) {
                    break;
                } 
                this._log(_('Interrupt received: Exiting.'));
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
        
                this._log(_('Adjusting number according to load'));
                cycle = 0;
            } else if (!frames_active) {
                /* No frames active! Hybernate for 5 seconds... */
                this.sleep(this.load_check_interval);
                cycle = this.load_cycles;
            }
            this.sleep(this.sleep_usec);
            ++cycle;
        }
        this._log(' Done.');
        this.exit();
        }, // __init

    },


    _startXpenguins: function() {
    },

    _ignoreMaximisedWindows: function() {
    },

    _maxPenguinsChanged: function() {
    },

    ignore_popups: function(newval) {
        if ( typeof newval == 'boolean' ) {
            this.ignorePopups = newval;
        }
        if ( this.ignorePopups ) {
            // ToonConfigure(TOON_NOSOLIDPOPUPS);
        } else {
            // ToonConfigure(TOON_SOLIDPOPUPS);
        }
        if (this._xpenguins_active) {
            /*
            ToonCalculateAssociations(penguin, penguin_number);
            ToonLocateWindows();
            ToonRelocateAssociated(penguin, penguin_number);
            */
        }
    },

    set_number: function(n) {
        if ( this._xpenguins_active ) {
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
          } else { // xpenguins isn't running
              this.nPenguins = n;
          }
          this._specify_number = 1; // TODO: NECESSARY?
    },

};

