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

        // now load (TODO) into this._theme
    },

    list_themes: function() {
        // look up everything in this.config_dir & return as array
    },


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

/*********************
 * xpenguins_core.c
 *********************/
    /* Start a new penguin from the top of the screen */
    initPenguin: function() {

    }

/* Global variables */
Toon penguin[PENGUIN_MAX];
ToonData **penguin_data = NULL;
unsigned int *penguin_numbers = NULL;
int penguin_number = 0;
unsigned int penguin_ngenera = 0;
char xpenguins_active = 0;
char xpenguins_blood = 1; /* 0 = suitable for children */
char xpenguins_angels = 1; /* 0 = no angels */
char xpenguins_specify_number = 0;
HeightWidth *genus_height_widths = NULL;

/* Start a new penguin from the top of the screen */
// NOTE: This function really shouldn't be using toon_* ! xpenguins and toon code should be different.
static
void
__xpenguins_init_penguin(Toon *p)
{
  ToonData *data = penguin_data[p->genus] + PENGUIN_FALLER;
  p->direction = RandInt(2);
  ToonSetType(p, PENGUIN_FALLER, p->direction,
	      TOON_UNASSOCIATED);
  ToonSetPosition(p, RandInt(ToonDisplayWidth()
			     - data->width),
		  1 - data->height);
  ToonSetAssociation(p, TOON_UNASSOCIATED);
  ToonSetVelocity(p, (p->direction)*2-1, data->speed);
  p->terminating = 0;

  // @@ Grab the background pixmap
  // Penguins start only partially on screen so .... only paint on part of it.
  unsigned int height,width;
  width  = genus_height_widths[p->genus].maxwidth;
  height = genus_height_widths[p->genus].maxheight;
  p->background = XCreatePixmap(toon_display, toon_root, width, height, DefaultDepth(toon_display,DefaultScreen(toon_display)));
  // Fill background green (debugging)
  XFillRectangle( toon_display, p->background, toon_drawGC, 0, 0, width, height );
  // cache corresponding little bit of background
  XCopyArea( toon_display, toon_root, p->background, toon_drawGC, 
                      MAX(p->x, 0), MAX(p->y,0),  
                      data->width + MIN( 0, p->x ), data->height + MIN(0, p->y), // that height could as well be 1 since start y is not random,  
                      MAX(-p->x,0), MAX(-p->y,0)    );
}

/* Turn a penguin into a climber */
static
void
__xpenguins_make_climber(Toon *p)
{
  if (p->direction) {
    ToonSetType(p, PENGUIN_CLIMBER, p->direction,
		TOON_DOWNRIGHT);
  }
  else {
    ToonSetType(p, PENGUIN_CLIMBER, p->direction,
		TOON_DOWNLEFT);
  }
  ToonSetAssociation(p, p->direction);
  ToonSetVelocity(p, 0, -penguin_data[p->genus][PENGUIN_CLIMBER].speed);
}

/* Turn a penguin into a walker. To ensure that a climber turning into
 * a walker does not lose its footing, set shiftforward to 1
 * (otherwise 0) */
static
void
__xpenguins_make_walker(Toon *p, int shiftforward)
{
  unsigned int newtype = PENGUIN_WALKER;
  int gravity = TOON_DOWN;

  if (shiftforward) {
    if (p->direction) {
      gravity = TOON_DOWNRIGHT;
    }
    else {
      gravity = TOON_DOWNLEFT;
    }
  }

  if (penguin_data[p->genus][PENGUIN_RUNNER].exists && !RandInt(4)) {
    newtype = PENGUIN_RUNNER;
    /* Sometimes runners are larger than walkers - check for immediate
       squash */
    if (ToonCheckBlocked(p, newtype, gravity)) {
      newtype = PENGUIN_WALKER;
    }
  }

  ToonSetType(p, newtype, p->direction, gravity);
  ToonSetAssociation(p, TOON_DOWN);
  ToonSetVelocity(p, penguin_data[p->genus][newtype].speed
		  * ((2 * p->direction) - 1), 0);
}

/* Turn a penguin into a faller */
static
void
__xpenguins_make_faller(Toon *p)
{
  ToonSetVelocity(p, (p->direction)*2 - 1,
		  penguin_data[p->genus][PENGUIN_FALLER].speed);
  ToonSetType(p, PENGUIN_FALLER, p->direction, TOON_UP);
  ToonSetAssociation(p, TOON_UNASSOCIATED);
}

/* Connect to X server and upload data */
char *
xpenguins_start(char *display_name)
{

  if (!penguin_data) {
    return _("No toon data installed");
  }
  if (!xpenguins_active) {
    int i, index, imod = 1;
    unsigned long configure_mask = TOON_SIDEBOTTOMBLOCK;

    /* reset random-number generator */
    srand(time((long *) NULL));
    if (!ToonOpenDisplay(display_name)) {
      return toon_error_message;
    }
    if (xpenguins_verbose && *toon_message) {
      fprintf(stderr, "%s\n", toon_message);
    }

    /* Set up various preferences: Edge of screen is solid,
     * and if a signal is caught then exit the main event loop */
    ToonConfigure(configure_mask);

    /* Set the distance the window can move (up, down, left, right)
     * and penguin can still cling on */
    ToonSetMaximumRelocate(16,16,16,16);

    /* Send the pixmaps to the X server - penguin_data should have been 
     * defined in penguins/def.h */
    ToonInstallData(penguin_data, penguin_ngenera, PENGUIN_NTYPES);

    /* work out the size of the background pixmaps */
    char * error;
    if ( error=__xpenguins_store_genus_information( penguin_ngenera, PENGUIN_NTYPES ) ) {
        return error;
    }

    if (!xpenguins_specify_number) {
      penguin_number = 0;
      for (i = 0; i < penguin_ngenera; ++i) {
	penguin_number += penguin_numbers[i];
      }
    }
    /* Set the genus of each penguin, whether it is to be activated or not */
    for (index = 0; index < penguin_ngenera && index < PENGUIN_MAX; ++index) {
      penguin[index].genus = index;
    }
    while (index < PENGUIN_MAX) {
      for (i = 0; i < penguin_ngenera; ++i) {
	int j;
	for (j = 0; j < penguin_numbers[i]-imod && index < PENGUIN_MAX; ++j) {
	  penguin[index++].genus = i;
	}
      }
      imod = 0;
    }
    /* Initialise penguins */
    for (i = 0; i < penguin_number; i++) {
      penguin[i].pref_direction = -1;
      penguin[i].pref_climb = 0;
      penguin[i].hold = 0;
      __xpenguins_init_penguin(penguin+i);
      penguin[i].x_map = 0;
      penguin[i].y_map = 0;
      penguin[i].width_map = 1; /* So that the screen isn't completely */
      penguin[i].height_map = 1; /*    cleared at the start */
      penguin[i].mapped = 0;
    }
    /* Find out where the windows are - should be done 
     * just before beginning the event loop */
    ToonLocateWindows();
  }
  xpenguins_active = 1;
  return NULL;
}


void
xpenguins_ignorepopups(char yn)
{
  if (yn) {
    ToonConfigure(TOON_NOSOLIDPOPUPS);
  }
  else {
    ToonConfigure(TOON_SOLIDPOPUPS);
  }
  if (xpenguins_active) {
    ToonCalculateAssociations(penguin, penguin_number);
    ToonLocateWindows();
    ToonRelocateAssociated(penguin, penguin_number);
  }
}

void
xpenguins_set_number(int n)
{

  //fprintf(stdout,"xpenguins_active:%i\n",xpenguins_active);
  int i;
  if (xpenguins_active) {
      if (n > penguin_number) {
          int i;
          if (n > PENGUIN_MAX) {
    	    n = PENGUIN_MAX;
          }
          for (i = penguin_number; i < n; i++) {
        	__xpenguins_init_penguin(penguin+i);			
    	    penguin[i].active = 1;
          }
          penguin_number = n;
      } else if (n < penguin_number) {
          if (n < 0) {
    	    n = 0;
          }
    
          for (i = n; i < penguin_number; i++) {
              ToonData *gdata = penguin_data[penguin[i].genus];
              if (penguin[i].active) {
                  if (xpenguins_blood && gdata[PENGUIN_EXIT].exists) {
                    ToonSetType(penguin+i, PENGUIN_EXIT,
                        penguin[i].direction, TOON_DOWN);
                  } else if (gdata[PENGUIN_EXPLOSION].exists) {
                    ToonSetType(penguin+i, PENGUIN_EXPLOSION,
                        penguin[i].direction, TOON_HERE);
                  } else {
                    penguin[i].active = 0;
                  }
              }
              penguin[i].terminating = 1;
          }
  
          ToonErase(penguin, penguin_number);
          ToonDraw(penguin, penguin_number);
          ToonFlush();
      } // if (n [<>] penguin_number)
  } else {
      penguin_number = n;
  } // if (xpenguins_active)
  xpenguins_specify_number = 1;
}

/* Returns the number of penguins that are active or not terminating */
/* i.e. when 0 is returned, we can call xpenguins_exit() */
int
xpenguins_frame()
{
  int status, i, direction;
  int last_active = -1;

  if (!xpenguins_active) {
    return 0;
  }

  /* check if windows have moved, and flush the display */
  if ( ToonWindowsMoved() ) {
    /* if so, check for squashed toons */
    ToonCalculateAssociations(penguin, penguin_number);
    ToonLocateWindows();
    ToonRelocateAssociated(penguin, penguin_number);
  }

  /* Loop through all the toons */
  for (i = 0; i < penguin_number; i++) {
    unsigned int type = penguin[i].type;
    ToonData *gdata = penguin_data[penguin[i].genus];
    if (!penguin[i].active) {
      if (!penguin[i].terminating) {
	__xpenguins_init_penguin(penguin+i);
	last_active = i;
      }
    }
    else if (toon_button_x >= 0
	     && type != PENGUIN_EXPLOSION && type != PENGUIN_ZAPPED
	     && type != PENGUIN_SQUASHED && type != PENGUIN_ANGEL
	     && type != PENGUIN_SPLATTED && type != PENGUIN_EXIT
	     && !penguin[i].terminating
	     && toon_button_x > penguin[i].x_map
	     && toon_button_y > penguin[i].y_map
	     && toon_button_x < penguin[i].x_map + penguin[i].width_map
	     && toon_button_y < penguin[i].y_map + penguin[i].height_map) {
      /* Toon has been hit by a button press */
      if (xpenguins_blood && gdata[PENGUIN_ZAPPED].exists) {
	ToonSetType(penguin+i, PENGUIN_ZAPPED,
		    penguin[i].direction, TOON_DOWN);
      }
      else if (gdata[PENGUIN_EXPLOSION].exists) {
	ToonSetType(penguin+i, PENGUIN_EXPLOSION,
		    penguin[i].direction, TOON_HERE);
      }
      else {
	penguin[i].active = 0;
      }
      ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
      last_active = i;
    }
    else {
      ToonData *data = gdata + type;
      long int conf = data->conf;

      last_active = i;
      if ( !((conf & TOON_NOBLOCK) | (conf & TOON_INVULNERABLE))
	   && ToonBlocked(penguin+i, TOON_HERE)) {
	if (xpenguins_blood && gdata[PENGUIN_SQUASHED].exists) {
	  ToonSetType(penguin+i, PENGUIN_SQUASHED,
		      penguin[i].direction, TOON_HERE);
	}
	else if (gdata[PENGUIN_EXPLOSION].exists) {
	  ToonSetType(penguin+i, PENGUIN_EXPLOSION,
		      penguin[i].direction, TOON_HERE);
	}
	else {
	  penguin[i].active = 0;
	}
	ToonSetVelocity(penguin+i, 0, 0);
	ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
      }
      else {
	status=ToonAdvance(penguin+i,TOON_MOVE);
	switch (type) {
	case PENGUIN_FALLER:
	  if (status != TOON_OK) {
	    if (ToonBlocked(penguin+i,TOON_DOWN)) {
	      if (penguin[i].pref_direction > -1)
		penguin[i].direction = penguin[i].pref_direction;
	      else
		penguin[i].direction = RandInt(2);
	      __xpenguins_make_walker(penguin+i, 0);
	      penguin[i].pref_direction = -1;
	    }
	    else {
	      if (!gdata[PENGUIN_CLIMBER].exists
		  || RandInt(2)) {
		ToonSetVelocity(penguin+i, -penguin[i].u,
				gdata[PENGUIN_FALLER].speed);
	      }
	      else {
		penguin[i].direction = (penguin[i].u > 0);
		__xpenguins_make_climber(penguin+i);
	      }
	    }
	  }
	  else if (penguin[i].v < data->terminal_velocity) {
	    penguin[i].v += data->acceleration;
	  }
	  break;

	case PENGUIN_TUMBLER:
	  if (status != TOON_OK) {
	    if (xpenguins_blood && data[PENGUIN_SPLATTED].exists
		&& penguin[i].v >= data->terminal_velocity
		&& !RandInt(3)) {
	      ToonSetType(penguin+i, PENGUIN_SPLATTED, TOON_LEFT, TOON_DOWN);
	      ToonSetAssociation(penguin+i, TOON_DOWN);
	      ToonSetVelocity(penguin+i, 0, 0);
	    }
	    else {
	      if (penguin[i].pref_direction > -1)
		penguin[i].direction = penguin[i].pref_direction;
	      else
		penguin[i].direction = RandInt(2);
	      __xpenguins_make_walker(penguin+i, 0);
	      penguin[i].pref_direction = -1;
	    }
	  }
	  else if (penguin[i].v < data->terminal_velocity) {
	    penguin[i].v += data->acceleration;
	  }
	  break;

	case PENGUIN_WALKER:
	case PENGUIN_RUNNER:
	  if (status != TOON_OK) {
	    if (status == TOON_BLOCKED) {
	      /* Try to step up... */
	      int u = penguin[i].u;
	      if (!ToonOffsetBlocked(penguin+i, u, -PENGUIN_JUMP)) {
		ToonMove(penguin+i, u, -PENGUIN_JUMP);
		ToonSetVelocity(penguin+i, 0, PENGUIN_JUMP - 1);
		ToonAdvance(penguin+i, TOON_MOVE);
		ToonSetVelocity(penguin+i, u, 0);
		/* Don't forget to accelerate! */
		if (abs(u) < data->terminal_velocity) {
		  if (penguin[i].direction) {
		    penguin[i].u += data->acceleration;
		  }
		  else {
		    penguin[i].u -= data->acceleration;
		  }
		}
	      }
	      else {
		/* Blocked! We can turn round, fly or climb... */
		int n = RandInt(8) * (1 - penguin[i].pref_climb);
		if (n < 2) {
		  char floater_exists = gdata[PENGUIN_FLOATER].exists;
		  char climber_exists = gdata[PENGUIN_CLIMBER].exists;
		  if ((n == 0 || !floater_exists) && climber_exists) {
		    __xpenguins_make_climber(penguin+i);
		    break;
		  }
		  else if (floater_exists) {
		    /* Make floater */
		    unsigned int newdir = !penguin[i].direction;
		    ToonSetType(penguin+i, PENGUIN_FLOATER,
				newdir, TOON_DOWN);
		    ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
		    ToonSetVelocity(penguin+i, 
				    (RandInt(5)+1) * (newdir*2-1),
				    -gdata[PENGUIN_FLOATER].speed);
		    break;
		  }
		}
		else {
		  /* Change direction *after* creating toon to make sure
                     that a runner doesn't get instantly squashed... */
		  __xpenguins_make_walker(penguin+i, 0);
		  penguin[i].direction = (!penguin[i].direction);
		  penguin[i].u = -penguin[i].u;
		}
	      }
	    }
	  }
	  else if (!ToonBlocked(penguin+i, TOON_DOWN)) {
	    /* Try to step down... */
	    int u = penguin[i].u; /* Save velocity */
	    ToonSetVelocity(penguin+i, 0, PENGUIN_JUMP);
	    status=ToonAdvance(penguin+i, TOON_MOVE);
	    if (status == TOON_OK) {
	      penguin[i].pref_direction = penguin[i].direction;
	      if (gdata[PENGUIN_TUMBLER].exists) {
		ToonSetType(penguin+i, PENGUIN_TUMBLER,
			    penguin[i].direction, TOON_DOWN);
		ToonSetAssociation(penguin+i, TOON_UNASSOCIATED);
		ToonSetVelocity(penguin+i, 0, gdata[PENGUIN_TUMBLER].speed);
	      }
	      else {
		__xpenguins_make_faller(penguin+i);
		penguin[i].u = 0;
	      }
	      penguin[i].pref_climb = 0;
	      
	    }
	    else {
	      ToonSetVelocity(penguin+i, u, 0);
	    }
	  }
	  else if (gdata[PENGUIN_ACTION0].exists && !RandInt(100)) {
	    unsigned int action = 1;
	    /* find out how many actions have been defined */
	    while (gdata[PENGUIN_ACTION0+action].exists
		   && ++action < PENGUIN_NACTIONS);
	    if (action) {
	      action = RandInt(action);
	    }
	    else {
	      action = 0;
	    }
	    /* If we have enough space, start the action: */
	    if (!ToonCheckBlocked(penguin+i, PENGUIN_ACTION0 + action, TOON_DOWN)) {
	      ToonSetType(penguin+i, PENGUIN_ACTION0 + action,
			  penguin[i].direction, TOON_DOWN);
	      ToonSetVelocity(penguin+i, gdata[PENGUIN_ACTION0+action].speed
			      * ((2*penguin[i].direction)-1), 0);
	    }
	  }
	  else if (abs(penguin[i].u) < data->terminal_velocity) {
	    if (penguin[i].direction) {
	      penguin[i].u += data->acceleration;
	    }
	    else {
	      penguin[i].u -= data->acceleration;
	    }
	  }
	  break;

	case PENGUIN_ACTION0:
	case PENGUIN_ACTION1:
	case PENGUIN_ACTION2:
	case PENGUIN_ACTION3:
	case PENGUIN_ACTION4:
	case PENGUIN_ACTION5:
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

/* Erase all penguins and close the display */
void
xpenguins_exit()
{
  //xpenguins_free_data();
  ToonCloseDisplay();
  xpenguins_active = 0;
}

/* Store the maximum width/height of pixmap for each genus of penguins: 
 * to allocate size of background pixmap 
 */ 
// NOTE: This function really shouldn't be using toon_* ! xpenguins and toon code should be different.
char *
__xpenguins_store_genus_information(int ngenera, int ntypes)
{

  if (!penguin_data) {
      return _("No toon data installed");
  }
  /* allocate the memory for genus_height_widths */
  if (!(genus_height_widths = malloc(ngenera * sizeof(HeightWidth)))) {
    return _("Not enough memory in __xpenguins_store_genus_information");
  }

  int i, j;
  unsigned int maxheight, maxwidth = 0;
  for (i = 0; i < ngenera; ++i) {
    maxheight = 0;
    maxwidth = 0;
    for (j = 0; j < ntypes; ++j) {
      ToonData *d = penguin_data[i]+j;
      maxwidth  = MAX( maxwidth, d->width );
      maxheight = MAX( maxheight, d->height );
      //fprintf(stdout,"genus %i: height,width %ix%i (%ix%i)\n",i,d->width,d->height, maxwidth, maxheight);
    }
    //fprintf(stdout,"max width: %i, max height: %i\n",maxwidth,maxheight);
    genus_height_widths[i].maxwidth = MIN( maxwidth, toon_display_width );
    genus_height_widths[i].maxheight = MIN( maxheight, toon_display_height );
  }
  return NULL;
}



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

