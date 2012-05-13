/* 
 * xpenguins_core.c:
 * + __xpenguins_init_penguin
 * + __xpenguins_make_climber
 * + __xpenguins_make_walker
 * + __xpenguins_make_faller
 *
 * xpenguins_theme.c:
 * + __xpenguins_copy_properties 
 *
 * toon_associate.c:
 * + ToonSetAssociation
 *
 * toon_set.c:
 * + ToonSetType, 
 * + ToonSetGenusAndType, 
 * + ToonSetVelocity
 * + ToonSetPosition
 *
 * toon_core.c:
 * + Advance
 *
 * toon_query.c:
 * + ToonCheckBlocked
 *
 * toon_draw.c:
 * + ToonDraw
 *
 * toon.h
 */

/* Use the Toon namespace */
const Toon = Toon || {};

/* Constants (toon.h) */
Toon.UNASSOCIATED = -2;
Toon.HERE = -1;
Toon.LEFT = 0;
Toon.RIGHT = 1;
Toon.UP = 2;
Toon.DOWN = 3;
Toon.UPLEFT = 4;
Toon.UPRIGHT = 5;
Toon.DOWNLEFT = 6;
Toon.DOWNRIGHT = 7;

Toon.FORCE = 1;
Toon.MOVE = 0;
Toon.STILL = -1;

Toon.OK = 1;
Toon.PARTIALMOVE = 0;
Toon.BLOCKED = -1;
Toon.SQUASHED = -2;

/* General configuration options */
Toon.DEFAULTS = 0;

Toon.NOEDGEBLOCK = (1<<0);
Toon.EDGEBLOCK = (1<<1);
Toon.SIDEBOTTOMBLOCK = (1<<2);
Toon.NOSOLIDPOPUPS = (1<<4);
Toon.SOLIDPOPUPS = (1<<5);
Toon.NOSHAPEDWINDOWS = (1<<6);
Toon.SHAPEDWINDOWS = (1<<7);
Toon.SQUISH = (1<<8);
Toon.NOSQUISH = (1<<9);

Toon.NOCATCHSIGNALS = (1<<16);
Toon.CATCHSIGNALS = (1<<17);
Toon.EXITGRACEFULLY = (1<<18);

/* Configuration for individual toon types */
Toon.NOCYCLE = (1<<0);
Toon.INVULNERABLE = (1<<1);
Toon.NOBLOCK = (1<<2);

Toon.MESSAGE_LENGTH = 128;
Toon.DEFAULTMAXRELOCATE = 8;

/**********************************/
/* The Toon structure describes the properties of a particular toon,
 * such as its location and speed */
/**********************************/

Toon.Toon = function() {
    this._init.apply(this, arguments);
}
Toon.Toon.prototype = {
    __proto__: Clutter.Texture.prototype,

    /* __xpenguins_init_penguin( Toon *p ) */
    _init: function() {
        // TODO: this.frame
        // position: in parent. this.x/this.y
        this.u = this.v = 0; /* velocity */
        this.genus = this.type = null;
        this.direction = RandInt(2);

        /* properties of the image mapped on the screen */
        this.x_map = this.y_map = null;
        this.width_map = this.height_map = null;

        
        this.associate = false; /* toon is associated with a window */
        this.wid = null; /* window associated with */

        //this.xoffset = this.yoffset = 0; /* location relative to window origin */
       
        this.frame = 0; /* Frame we're up to in the animation */
        this.cycle = 0; /* Number of times frame cycle has repeated */

        this.pref_direction = null;
        this.pref_climb = null;
        this.hold = null;          // <-- TODO
        this.active = false;
        this.terminating = false;
        this.mapped = false;       // <-- TODO (in parent?) (yep)
        this.squished = false;
        //Pixmap background;   /* @@ storing the background so we can repaint where we've been */

        this.data = GLOBAL.ToonData[this.genus][this.type];
        this.set_type('faller',this.direction,Toon.UNASSOCIATED);
        this.set_position( RandInt(GLOBAL.XPenguinsWindow.width - this.data.width), 1 - data.height );
        this.set_association( Toon.UNASSOCIATED );
        this.set_velocity( this.direction*2-1, this.data.speed );
    },

    /* ToonSetType */
    set_type: function( type, direction, gravity ) {
        this.set_genus_and_type( this.genus, type, direction, gravity );
    },

    /* Change a toons genus and type and activate it. */
    /* Gravity determines position offset of toon if size different from
     * previous type.
     * ToonSetGenusAndType */
    set_genus_and_type: function( genus, type, direction, gravity ) {
        let new_position = this.calculate_new_position(genus, type, gravity);
        this.set_position(new_position[0], new_position[1]);
        this.type = type;
        this.genus = genus;
        this.data = newdata;
        this.cycle = 0;
        this.direction = direction;
        this.frame = 0;
        this.active = true;
    },

    /* Set a toons association direction - e.g. Toon_DOWN if the toon
       is walking along the tops the window, Toon_UNASSOCIATED if
       the toon is in free space */
    // ToonSetAssocation
    set_association: function( assoc ) {
        toon.associate = direction;
    },

    // ToonSetVelocity
    set_velocity: function( u, v ) { 
        this.u = u;
        this.v = v;
    },

    /* Calculates the new x and y when a toon changes type/genus
     * Used in both SetGenusAndType and CheckBlocked.
     * Returns array [newx,newy].
     */
    calculate_new_position: function( genus, type, gravity ) {
        let newdata = GLOBAL.ToonData[genus][type];
        let x=toon.x, y=toon.y;
        if ( this.gravity == Toon.HERE ) {
            x += Math.round((this.data.width - newdata.width)/2);
            y += Math.round((this.data.height - newdata.height)/2);
        } else if ( this.gravity == Toon.DOWN ) {
            x += Math.round((this.data.width - newdata.width)/2);
            y += Math.round((this.data.height - newdata.height));
        } else if ( this.gravity == Toon.UP ) {
            x += Math.round((this.data.width - newdata.width)/2);
        } else if ( this.gravity == Toon.LEFT ) {
            y += Math.round((this.data.height - newdata.height)/2);
        } else if ( this.gravity == Toon.RIGHT ) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height)/2);
        } else if ( this.gravity == Toon.DOWNLEFT ) {
            y += Math.round((this.data.height - newdata.height));
        } else if ( this.gravity == Toon.DOWNRIGHT ) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height));
        } else if ( this.gravity == Toon.UPRIGHT ) {
            x += Math.round((this.data.width - newdata.width));
        }
        return [x,y];
    },

    /* Check to see if a toon would be squashed instantly if changed to
     *  certain type, return 1 if squashed, 0 otherwise. Useful to call
     *  before ToonSetType(). 
     * ToonCheckBlocked
     */
    check_blocked: function( type, gravity ) {
        let newpos = this.calculate_new_position(this.genus, type, gravity);
        let newdata = GLOBAL.ToonData[this.genus][type];
        // TODO:
        return XRectInRegion(toon_windows, newpos[0], newpos[1], newdata.width, newdata.height);
    },

    /* Turn a penguin into a climber */
    // __xpenguins_make_climber
    make_climber: function() {
        this.set_type('climber', this.direction, (this.direction ? Toon.DOWNRIGHT : Toon.DOWNLEFT));
        this.SetAssocation( this.direction );
        this.set_velocity( 0, -this.data.speed ); // this.data is now CLIMBER
    },

    /* Turn a penguin into a walker. To ensure that a climber turning
     * into a walker does not loose its footing, set shiftforward
     * to 1 (otherwise 0)
     */
    // __xpenguins_make_walker
    make_walker: function(shiftforward) {
        let gravity = (shiftforward ? 
                        (this.direction ? Toon.DOWNRIGHT : Toon.DOWNLEFT) :
                        Toon.DOWN);
        let newtype = 'walker';
        // 25%  chance of becoming a runner
        if ( GLOBAL.ToonData[this.genus]['runner'] && !RandInt(4) ) {
            newtype = 'runner';
            /* Sometimes runners are larger than walkers: check for immediate squash */
            if ( this.check_blocked( newtype, gravity ) )
                newtype = 'walker';
        }
        this.set_type( newtype, this.direction, gravity );
        this.set_association( Toon.DOWN );
        this.set_velocity( this.data.speed*(2*this.direction-1), 0 );
    },

    /* Turn penguin into a faller
     * __xpenguins_make_faller
     */
    make_faller: function() {
        this.set_type('faller', this.direction, Toon.UP);
        this.set_velocity( this.direction*2-1, this.data.speed );
        this.set_association(Toon.UNASSOCIATED);
    },

    /* Attempt to move a toon based on its velocity.
     * 'mode' can be: 
     * - Toon.MOVE (move unless blocked),
     * - Toon.FORCE (move regardless),
     * - Toon.STILL (test move but don't actually do it).
     * Returns: 
     * - Toon.BLOCKED if blocked, 
     * - Toon.OK if unblocked
     * - Toon.PARTIALMOVE if limited movement is possible
     * ToonAdvance
     */
    Advance: function(mode) {
        let move_ahead = ( mode == Toon.STILL ? false : true );

        let newx = this.x + this.u;
        let newy = this.y + this.v;
        let stationary = ( this.u == 0 && this.v == 0 );

        let result;

        if ( this.data.conf & Toon.NOBLOCK ) {
            /* Just consider blocking by the sides of the screen */
            if ( GLOBAL.TOON_EDGE_BLOCK ) {
                if ( newx < 0 ) {
                    newx = 0;
                    result = Toon.PARTIALMOVE;
                } else if ( newx + this.data.width > GLOBAL.XPenguinsWindow.width ) {
                    newx = GLOBAL.XPenguinsWindow.width - data.width;
                    result = Toon.PARTIALMOVE;
                }
            }
        } else {
        /* Consider all blocking */

            if ( GLOBAL.TOON_EDGE_BLOCK ) {
                if ( newx < 0 ) {
                    newx = 0;
                    result = Toon.PARTIALMOVE;
                } else if ( newx + this.data.width > GLOBAL.XPenguinsWindow.width ) {
                    newx = GLOBAL.XPenguinsWindow.width - data.width;
                    result = Toon.PARTIALMOVE;
                }
                if ( newy < 0 && GLOBAL.TOON_EDGE_BLOCK != 2 ) {
                    newy = 0;
                    result = Toon.PARTIALMOVE;
                } else if ( newy + this.data.height > GLOBAL.XPenguinsWindow.height ) {
                    newy = GLOBAL.XPenguinsWindow.height - data.height;
                    result = Toon.PARTIALMOVE;
                }
                if ( newx == this.x && newy == this.y && !stationary ) {
                    result = Toon.BLOCKED;
                }
            }

            /* Is new toon location fully/partially filled with windows? */
            // TODO. new_zone boolean for now FALSE if RectangleOut TRUE otherwise
            let new_zone = XRectInRegion(GLOBAL.toon_windows,newx,newy,this.data.width,this.data.height);
            if ( new_zone && mode == Toon.MOVE &&
                 result != Toon.BLOCKED && !stationary ) {
                let tryx, tryy, step=1, u=newx-this.x, v=newy-this.y;
                result = Toon.BLOCKED;
                move_ahead=false;
                /* How far can we move the toon? */
                if ( Math.abs(v) < Math.abs(u) ) {
                    if ( newx > this.x ) {
                        step = -1;
                    }
                    for ( tryx = newx+step; tryx != this.x; tryx += step ) {
                        tryy = this.y + (tryx-this.x)*v/u;
                        // why the '!'?
                        if ( !XRectInRegion(GLOBAL.toon_windows, tryx, tryy, this.data.width, this.data.height) ) {
                            newx = tryx;
                            newy = tryy;
                            result = Toon.PARTIALMOVE;
                            move_ahead=true;
                            break;
                        }
                    }
                // faster vertically than horiz
                } else {
                    if ( newy > this.y ) {
                        step=-1;
                    }
                    for ( tryy = newy+step; tryy != this.y; tryy += step ) {
                        tryx = this.x + (tryy-this.y)*u/v;
                        if ( !XRectInRegion(GLOBAL.toon_windows, tryx, tryy, this.data.width, this.data.height) ) {
                            newx = tryx;
                            newy = tryy;
                            result = Toon.PARTIALMOVE;
                            move_ahead=true;
                            break;
                        }
                    }
                }

                xy = this.xy;
                MAJ = ( Math.abs(uv[1]) < Math.abs(uv[0]) ? 0 : 1 );
                MIN = 1-MAJ;
                if ( newxy[MAJ] > xy[MAJ] ) {
                    step = -1;
                }
                /*
                 * Compresses the above into one step.
                let tryMAX, tryMIN, tryxy=[], step;
                for ( tryMAX = newxy[MAJ]+step; tryMAX != xy[MAJ]; tryMAX += step ) {
                    tryMIN = xy[MIN] + (tryMAX-xy[MAJ])*uv[MIN]/uv[MAX];
                    tryxy[MAX] = tryMAX;
                    tryxy[MIN] = tryMIN;
                    if ( !XRectInRegion(GLOBAL.toon_windows, tryxy[0], tryxy[1], this.data.width, this.data.height) ) {
                        newxy = tryxy;
                        result = Toon.PARTIALMOVE;
                        move_ahead=true;
                        break;
                    }
                }
                */
            }
        } /* what sort of blocking to consider */

        if ( move_ahead ) {
            this.x = newx;
            this.y = newy;
            // see if we've scrolled to the end of the filmstrip
            if ( (++this.frame) >= this.nframes ) {
                this.frame = 0;
                ++(this.cycle);
                if ( GLOBAL.NOCYCLE ) {
                    this.active = 0;
                }
            }
        } else if ( GLOBAL.NOCYCLE ) {
            if ( (++this.frame) >= this.nframes ) {
                this.frame = 0;
                this.cycle = 0;
                this.active = 0;
            }
        }
        return result;
    }, // advance

    /* DRAWING */

    /* Draws the current toon */
    Draw: function() {
        /* Draw the background on (do I need that?) */

        /* Draw the toon on */
        if ( this.active ) {
            let direction = (this.drection >= this.data.ndirections ? 0 : this.direction);

            /* Set the clip mask for the penguin,
             * i.e. define the rectangle of the pixmap to show */
            /* Draw the penguin on the screen */
            /* Unset the clip mask */

            /* update properties */
            this.x_map = this.x;
            this.y_map = this.y;
            this.width_map = this.data.width;
            this.height_map = this.data.height;
            this.mapped = true;
        } else {
            this.mapped = false;
        }
    }, 

    /* Erase the current toon.
     * If toon_expose is set then every expose_cycles frame an expose
     * event is sent to redraw any desktop icons.
     */
    // TODO: Do I need to bother with expose events?
    // Depends on if I draw on the current screen's display or a window sitting over it.
    Erase: function() {
        if ( this.mapped ) {
            // XClearArea( this.x_map, this.y_map, this.width_map, this.height_map );
            // Loop through toons and find {min,max}{x,y}
            if ( GLOBAL.toon_expose && GLOBAL.expose_count > 100 && maxx > minx && maxy > miny ) {
                // send expose event
                GLOBAL.expose_count=0;
            } else {
                ++GLOBAL.expose_count;
            }
        }
    },
}

/**********************************/
/* The ToonData structure describes the properties of a type of toon,
 * such as walker, climber etc. */
/**********************************/
Toon.ToonData = function() {
    this._init.apply(this, arguments);
}
/* Glorified object with init function */
// Hmm - store .image as a Clutter.Texture.
// That allows one with .master to have .image pointing
// to the Clutter.Texture. Though one might argue
// that these could then be a Clutter.Clone?
Toon.ToonData.prototype = {

    /* __xpenguins_copy_properties */
    _init: function(otherToonData) {
        /* Properties: set default values */
        this.conf = Toon.DEFAULTS;      /* bitmask of toon properties such as cycling etc */
        this.image = null;
        this.filename = null;  
        this.master = null;             /* If pixmap data is duplicated from another toon, this is it */
        this.pixmap = this.mask = null; /* pointers to X structures */
        this.nframes = 0;               /* number of frames in image */
        this.ndirections = 1;           /* number directions in image (1 or 2) */
        this.width = this.height = 30;  /* width & height of individual frame/dir */
        this.acceleration = this.terminal_velocity = 0;
        this.speed = 4;
        this.loop = 0;                  /* Number of times to repeat cycle */
        // TODO (small) : need 'exists' ?
        // this.exists = false;

        /* Copy select properties from otherToonData to here. */
        // TODO: do objects do this by default?
        /* TODO: listen to load-finished signal & load asynchronously */
        if ( otherToonData ) {
            let propListToCopy = ['nframes', 'ndirections', 'width', 'height',
                                  'acceleration', 'speed', 'terminal_velocity',
                                  'conf', 'loop', 'master'];
            for ( let i=propListToCopy.length; --i; ) {
                this[propListToCopy[i]] = otherToonData[propListToCopy[i]];
            }
        }
    },

    load_image: function( filename ) {
        this.image = new Clutter.Texture.set_from_file(filename);
        // default synchronous. this.image.[sg]et_load_async()
    },

    /* bind this.filename to this.image.filename */
    get filename(): {
        return this.image.filename;
    },

    /* TODO: set filename? does this prompt a reload of load_image? make read-only? */

};

