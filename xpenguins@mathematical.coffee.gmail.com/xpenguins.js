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
        if ( this.options.DEBUG ) {
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
        load_check_interval : 5000, /* ms between load average checks */
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
        sleep_msec : 0, // <-- delay in milliseconds between each frame.
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
        this._sleepID = null;

        /* See if load averaging will work */ 
        if ( this.options.load1 >= 0 ) {
            let load = loadAverage();
            if ( load < 0 ) {
                this.options.log(_("Warning: cannot detect load averages on this system\n"));
                this.options.load1 = -1;
                this.options.load2 = -1;
            } else {
                this.options.load_cycles = this.options.load_check_interval/this.options.sleep_msec;
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
        if ( !opt.sleep_msec ) {
            opt.sleep_msec = this._theme.delay;
        }
        this.timeline.set_duration(opt.sleep_msec); // ??
        // BIGTODO: I ONLY WANT *ONE FRAME* PER TIMELINE?
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
                    // BIGTODO: frames_active = xpenguins_frame() || !interupts?
                }
        );
        this.frames_active = 0; // <- necessary?
        this.cycle = 0;
        this._interupts = 0; // replaced by:
        this._exiting = false;
    },

    _onInterrupt: function() {
        if ( this.options.DEBUG ) {
            this.log('.');
        }

        this.log(_('Interrupt received: Exiting.'));
       
        /* set the 'exit gracefully flag' */ 
        // TODO
        ToonConfigure(TOON_EXITGRACEFULLY);
        this.set_number(0);

        this._exiting = true;
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
    
    _frame: function(timeline, elapsed_time) {
        /* xpenguins_frame() */
        let sstatus, direction, last_active = -1;
        
        /* Loop through all the toons */
        // BIG BIG TODO: this.nPenguins is the number of penguins meant to be
        // active, not including the dying ones.
        // This._penguins.length can include dead penguins up to the max for the theme
        // (????????)
        // Do I need a this.currentPenguins?
        for ( let i=0; i<this._penguins.length; ++i ) {
            if ( !this._penguins[i].active ) {
                if (!this._penguins[i].terminating) {
                    // it's done terminating and needs to be reborn! :D
                    this._penguins[i].init();
                    last_active = i; // TODO: what for?
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
                let data = GLOBAL.ToonData[toon.genus];
                last_active = i; // TODO: seems to be set to i always?

                // TODO: this.conf
                /* see if the toon is squashed */
                if ( !((this.conf & Toon.NOBLOCK) | (this.conf & Toon.INVULNERABLE))
                        && toon.blocked(Toon.HERE) ) {
                    if ( o.blood && data['squashed'] ) {
                        toon.set_type('squashed', toon.direction, Toon.HERE);
                    } else if ( data['explosion'] ) {
                        toon.set_type('explosion', toon.direction, Toon.HERE);
                    } else {
                        toon.active = 0;
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
                            if ( toon.blocked(Toon.DOWN) ) {
                                toon.direction = ( toon.pref_direction > -1 ?
                                                   toon.pref_direction : GLOBAL.RandInt(2) );
                                toon.make_walker(false);
                                toon.pref_direction = -1;
                            } else {
                                /* turn into climber (if exists) or bounce off */
                                if ( !data['climber'] || GLOBAL.RandInt(2) ) {
                                    toon.set_velocity(-toon.u, data['faller'].speed);
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
                            if ( o.blood && data['splatted'] &&
                                 toon.v >= toon.data.terminal_velocity &&
                                 !GLOBAL.RandInt(3) ) {
                                toon.set_type('splatted', Toon.LEFT, Toon.DOWN);
                                toon.set_association(Toon.DOWN);
                                toon.set_velocity(0, 0);
                            } else {
                                /* got lucky - didn't splat: walk */
                                toon.direction = ( toon.pref_direction > -1 ?
                                                   toon.pref_direction : GLOBAL.RandInt(2) );
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
                                    toon.moveby(u, -PENGUIN_JUMP);
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
                                        let n = GLOBAL.RandInt(8)*(1-toon.pref_climb);
                                        if ( n < 2 ) {
                                            if ( (n==0 || !data['floater']) && data['climber'] ) {
                                                toon.make_climber();
                                                //break
                                            } else if ( data['floater'] ) {
                                                /* make floater */
                                                let newdir = +!penguin.direction; // coerce to int
                                                toon.set_type('floater', newdir, Toon.DOWN);
                                                toon.set_association( Toon.UNASSOCIATED );
                                                toon.set_velocity( (RandInt(5)+1)*(newdir*2-1),
                                                                   -data['floater'].speed );
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
                        } else if ( !toon.blocked( Toon.DOWN ) ) {
                            /* try to step (tumble/fall) down... */
                            let u = toon.u;
                            toon.set_velocity(0, PENGUIN_JUMP);
                            sstatus = toon.Advance( Toon.MOVE );
                            if ( sstatus == Toon.OK ) {
                                toon.pref_direction = toon.direction;
                                if ( data['tumbler'] ) {
                                    toon.set_type('tumbler', toon.direction, Toon.DOWN);
                                    toon.set_assocation( Toon.UNASSOCIATED );
                                    toon.set_velocity( data['tumbler'].speed );
                                } else {
                                    toon.make_faller();
                                    toon.u = 0;
                                }
                                toon.pref_climb = false;
                            } else { /* couldn't tumble down */
                                toon.set_velocity(u, 0);
                            } 
                        /* 1/100 chance of becoming actionX */
                        } else if ( data['action0'] && !GLOBAL.RandInt(100) ) {
                            let action = 1;
                            /* find out how many actions exist */
                            // TODO: store this in ToonData to prevent recalculating *every frame & genus*?
                            while ( data['action%i'.format(action)] && ++action ) {};
                            /* pick a random one */
                            action = GLOBAL.RandInt(action);
                            let actionN = 'action%i'.format(action);
                            /* If we have enough space, start the action: */
                            if ( !toon.CheckBlocked(actionN, Toon.DOWN) ) {
                                toon.set_type(actionN, toon.direction, Toon.DOWN);
                                toon.set_velocity(data[actionN].speed*(2*toon.direction-1), 0);
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
                        // UPTO
                    } // switch( toon.type )
            } // toon state
        } // penguin loop
        // BIG BIG TODO: put ToonData & penguins on the stage!

	switch (type) {
	case PENGUIN_ACTIONX:
	  if (status != TOON_OK) {
	    /* Try to drift up... */
	    int u = penguin[i].u;
	    if (!ToonOffsetBlocked(penguin+i, u, -PENGUIN_JUMP)) {
	      ToonMove(penguin+i, u, -PENGUIN_JUMP);
	      ToonSetVelocity(penguin+i, 0, PENGUIN_JUMP - 1);
	      ToonAdvance(penguin+i, TOON_MOVE);
	      ToonSetVelocity(penguin+i, u, 0);
	    }
	    else {
	      /* Blocked! Turn back into a walker: */
	      __xpenguins_make_walker(penguin+i, 0);
	    }
	  }
	  else if (!ToonBlocked(penguin+i, TOON_DOWN)) {
	    /* Try to drift down... */
	    ToonSetVelocity(penguin+i, 0, PENGUIN_JUMP);
	    status=ToonAdvance(penguin+i, TOON_MOVE);
	    if (status == TOON_OK) {
	      if (gdata[PENGUIN_TUMBLER].exists) {
		ToonSetType(penguin+i, PENGUIN_TUMBLER,
			    penguin[i].direction, TOON_DOWN);
		ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
		ToonSetVelocity(penguin+i, 0,
				gdata[PENGUIN_TUMBLER].speed);
	      }
	      else {
		__xpenguins_make_faller(penguin+i);
	      }
	      penguin[i].pref_climb = 0;
	    }
	    else {
	      ToonSetVelocity(penguin+i, data->speed
			      * ((2*penguin[i].direction)-1), 0);
	    }
	  }
	  else if (penguin[i].frame == 0) {
	    int loop = data->loop;
	    if (!loop) {
	      loop = -10;
	    }
	    if (loop < 0) {
	      if (!RandInt(-loop)) {
		__xpenguins_make_walker(penguin+i, 0);
	      }
	    }
	    else if (penguin[i].cycle >= loop) {
	      __xpenguins_make_walker(penguin+i, 0);
	    }
	  }
	  break;

	case PENGUIN_CLIMBER:
	  direction = penguin[i].direction;
	  if (penguin[i].y < 0) {
	    penguin[i].direction = (!direction);
	    __xpenguins_make_faller(penguin+i);
	    penguin[i].pref_climb = 0;
	  }
	  else if (status == TOON_BLOCKED) {
	    /* Try to step out... */
	    int v = penguin[i].v;
	    int xoffset = (1-direction*2) * PENGUIN_JUMP;
	    if (!ToonOffsetBlocked(penguin+i, xoffset, v)) {
	      ToonMove(penguin+i, xoffset, v);
	      ToonSetVelocity(penguin+i, -xoffset-(1-direction*2), 0);
	      ToonAdvance(penguin+i, TOON_MOVE);
	      ToonSetVelocity(penguin+i, 0, v);
	    }
	    else {
	      penguin[i].direction = (!direction);
	      __xpenguins_make_faller(penguin+i);
	      penguin[i].pref_climb = 0;
	    }
	  }
	  else if (!ToonBlocked(penguin+i, direction)) {
	    if (ToonOffsetBlocked(penguin+i, ((2*direction)-1)
				  * PENGUIN_JUMP, 0)) {
	      ToonSetVelocity(penguin+i, ((2*direction)-1)
			      * (PENGUIN_JUMP - 1), 0);
	      ToonAdvance(penguin+i, TOON_MOVE);
	      ToonSetVelocity(penguin+i, 0, -data->speed);
	    }
	    else {
	      __xpenguins_make_walker(penguin+i, 1);
	      ToonSetPosition(penguin+i, penguin[i].x + (2*direction)-1,
			      penguin[i].y);
	      penguin[i].pref_direction = direction;
	      penguin[i].pref_climb = 1;
	    }
	  }
	  else if (penguin[i].v > -data->terminal_velocity) {
	    penguin[i].v -= data->acceleration;
	  }
	  break;

	case PENGUIN_FLOATER:
	  if (penguin[i].y < 0) {
	    penguin[i].direction = (penguin[i].u > 0);
	    __xpenguins_make_faller(penguin+i);
	  }
	  else if (status != TOON_OK) {
	    if (ToonBlocked(penguin+i, TOON_UP)) {
	      penguin[i].direction = (penguin[i].u>0);
	      __xpenguins_make_faller(penguin+i);
	    }
	    else {
	      penguin[i].direction = !penguin[i].direction;
	      ToonSetVelocity(penguin+i,-penguin[i].u,
			      -data->speed);
	    }
	  }
	  break;
	case PENGUIN_EXPLOSION:
	  if (xpenguins_angels && !penguin[i].terminating
	     && gdata[PENGUIN_ANGEL].exists) {
	    ToonSetType(penguin+i, PENGUIN_ANGEL,
			penguin[i].direction, TOON_HERE);
	    ToonSetVelocity(penguin+i, RandInt(5) -2,
			    -gdata[PENGUIN_ANGEL].speed);
	    ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
	  }
	case PENGUIN_ANGEL:
	  if (penguin[i].y < -((int) data->height)) {
	    penguin[i].active = 0;
	  }
	  if (status != TOON_OK) {
	    penguin[i].u = -penguin[i].u;
	  } 
	}
      }
    }
  }
  /* First erase them all, then draw them all
   * - greatly reduces flickering */
  ToonErase(penguin, penguin_number);
  ToonDraw(penguin, penguin_number);
  ToonFlush();

  penguin_number = last_active + 1;

  /* Clear any button press information */
  toon_button_x = toon_button_y = -1;

  return penguin_number;
}

        // TODO: timeline.get_current_repeat() could be this.cycle,
        // if only there were one frame per repeat?

        // small todo: code cleanup. all the this. & this._
        // & o.
        // TODO: it's a 'while'
        /*
        if ( frames_active != ??_frame() && interupts ) {
            //stop the timeline!
            return;
        }
        */
        let o = this.options;
        /* check the CPU loading */
        if ( !this._exiting && this.cycle > o.load_cycles &&
                o.load1 >= 0 ) {
            let load = loadAverage();
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
            this.cycle = 0;
        } else if (!this.frames_active) {
            /* No frames active! Hybernate for 5 seconds... */
            this.cycle = o.load_cycles;

            // TODO: pause timer for specified time.
            timeline.pause();
            this._sleepID = Mainloop.timeout_add( o.load_check_interval,
                    function () { timeline.start(); } );
        }
        ++this.cycle;
    }, // _frame

    set_number: function(n) {
        if ( !this._xpenguins_active ) {
            this.nPenguins = n;
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
            // BIG TODO: set this.nPenguins = n in this case?
          /*
          ToonErase(this._penguins, this.nPenguins);
          ToonDraw(this._penguins, this.nPenguins);
          ToonFlush();
          */
        }
    },

};
