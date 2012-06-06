/* the Toon class, and ToonData class (holds info about a particular genus & type).
 * xpenguins_core.c : __xpenguins_init_penguin, __xpenguins_make_climber,
 *                    __xpenguins_make_walker, __xpenguins_make_faller
 * xpenguins_theme.c: __xpenguins_copy_properties
 * toon_associate.c : ToonSetAssociation, ToonCalculateAssociations, 
 *                    ToonSetMaximumRelocate, ToonRelocateAssociated
 * toon_set.c       : ToonSetType, ToonSetGenusAndType, ToonSetVelocity,
 *                    ToonSetPosition, ToonMove
 * toon_core.c      : ToonAdvance
 * toon_query.c     : ToonCheckBlocked, ToonBlocked, ToonOffsetBlocked
 * toon_draw.c:     : ToonDraw
 * toon.h           : constants.
 */

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const XPUtil = Me.util;

/* Constants (toon.h) */
const UNASSOCIATED = -2;
const HERE = -1;
const LEFT = 0;
const RIGHT = 1;
const UP = 2;
const DOWN = 3;
const UPLEFT = 4;
const UPRIGHT = 5;
const DOWNLEFT = 6;
const DOWNRIGHT = 7;

const FORCE = 1;
const MOVE = 0;
const STILL = -1;

const OK = 1;
const PARTIALMOVE = 0;
const BLOCKED = -1;
const SQUASHED = -2;

/* General configuration options */
const NOEDGEBLOCK = 0;
const EDGEBLOCK = (1 << 1);
const SIDEBOTTOMBLOCK = (1 << 2);

/* Configuration for individual toon types */
const DEFAULTS = 0;
const NOCYCLE = (1 << 0);
const INVULNERABLE = (1 << 1);
const NOBLOCK = (1 << 2);


/********************************************************************
 * The Toon structure describes the properties of a particular toon,
 * such as its location and speed.
 * This is essentially a Clutter.Actor that is a Clutter.Clone of
 * the ToonData (Texture) corresponding to its type.
 ********************************************************************/
function Toon() {
    this._init.apply(this, arguments);
};

Toon.prototype = {
    _init: function (globalvars, props, params) {
        /* __xpenguins_init_penguin(Toon *p) */
        this.actor = new Clutter.Clone(params || {});

        /* initialisation */
        this.u = this.v = 0; /* velocity */
        this.genus = null;
        this.type = 'faller';
        this.direction = null;

        /* toon is associated with a window */
        this.associate = UNASSOCIATED; 
        this.wid = null;  /* window toon is associated with */
        this.xoffset = 0; /* location relative to window origin */
        this.yoffset = 0;

        this.frame = 0; /* Frame we're up to in the animation */
        this.cycle = 0; /* Number of times frame cycle has repeated */

        this.pref_direction = -1;
        this.pref_climb = false;
        this.active = false;
        this.terminating = false; /* whether toon is not to be respawned */
        this.squished = false;

        this.data = null; /* reference to ToonData[this.genus][this.type] */

        // UGLY way to pass in the theme/toon data/stage info/parameters.
        /* needs: XPenguinsWindow's width, height; ToonData; toon_windows;
         * various configuration options.
         *  (also, is it *expensive* to carry a reference around in each toon?)
         */
        this._globals = globalvars;

        if (props) {
            for (let prop in props) {
                if (props.hasOwnProperty(prop) && this.hasOwnProperty(prop)) {
                    this[prop] = props[prop];
                }
            }
        }
        this.actor.set_position(0, 0);
        if (this.genus !== null) {
            this.init();
        }

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
    }, // _init

    /* GNOME 3.2 laziness: */
    show: function () {
        this.actor.show();
    },

    hide: function () {
        this.actor.hide();
    },

    set_position: function (x, y) {
        this.actor.set_position(x, y);
    },

    move_by: function (dx, dy) {
        this.actor.move_by(dx, dy);
    },

    get x() {
        return this.actor.x;
    },

    get y() {
        return this.actor.y;
    },

    /* Only call this *after* setting the toon's genus */
    init: function () {
        XPUtil.DEBUG(('TOON.INIT: genus: ' + this.genus + ' type: ' + this.type));
        this.data = this._globals.toonData[this.genus][this.type];
        this.direction = XPUtil.RandInt(2);
        this.setType('faller', this.direction, UNASSOCIATED);
        this.actor.set_position(XPUtil.RandInt(this._globals.XPenguinsWindow.get_width() - this.data.width), 1 - this.data.height);
        this.setAssociation(UNASSOCIATED);
        this.setVelocity(this.direction * 2 - 1, this.data.speed);
        this.terminating = false;
    },

    /**** ASSIGNMENT FUNCTIONS (toon_set.c) ****/
    /* ToonSetType */
    setType: function (type, direction, gravity) {
        XPUtil.DEBUG('  toon changing from %s to %s'.format(this.type, type));
        this.setGenusAndType(this.genus, type, direction, gravity);
    },

    /* Change a toons genus and type and activate it. */
    /* Gravity determines position offset of toon if size different from
     * previous type.
     * ToonSetGenusAndType */
    setGenusAndType: function (genus, type, direction, gravity) {
        let new_position = this.calculateNewPosition(genus, type, gravity);
        this.actor.set_position(new_position[0], new_position[1]);
        this.type = type;
        this.genus = genus;
        this.cycle = 0;
        this.direction = direction;
        this.frame = 0;
        this.active = true;
        /* precache .data rather than having a getter */
        this.data = this._globals.toonData[this.genus][this.type]; 
        this.actor.set_source(this.data.texture);
    },

    /* Set a toons association direction - e.g. Toon_DOWN if the toon
       is walking along the tops the window, Toon_UNASSOCIATED if
       the toon is in free space */
    // ToonSetAssocation
    setAssociation: function (direction) {
        this.associate = direction;
    },

    // ToonSetVelocity
    setVelocity: function (u, v) {
        this.u = u;
        this.v = v;
    },

    /**** QUERY FUNCTIONS (toon_query.c) ****/
    /* Calculates the new x and y when a toon changes type/genus
     * Used in both SetGenusAndType and checkBlocked.
     * Returns array [newx, newy].
     */
    calculateNewPosition: function (genus, type, gravity) {
        let newdata = this._globals.toonData[genus][type],
            x = this.x,
            y = this.y;
        if (gravity === HERE) {
            x += Math.round((this.data.width - newdata.width) / 2);
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === DOWN) {
            x += Math.round((this.data.width - newdata.width) / 2);
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === UP) {
            x += Math.round((this.data.width - newdata.width) / 2);
        } else if (gravity === LEFT) {
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === RIGHT) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === DOWNLEFT) {
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === DOWNRIGHT) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === UPRIGHT) {
            x += Math.round((this.data.width - newdata.width));
        }
        return [x, y];
    },

    /* Returns 1 if the toon is blocked in the specified direction,
     * 0 if not blocked and -1 if the direction argument was out of bounds
     * ToonBlocked
     */
    blocked: function (direction) {
        if (this._globals.edge_block) {
            if (direction === LEFT) {
                if (this.x <= 0) {
                    return 1;
                }
            } else if (direction === RIGHT) {
                if (this.x + this.data.width >= this._globals.XPenguinsWindow.get_width()) {
                    return 1;
                }
            } else if (direction === UP) {
                if (this.y <= 0) {
                    return 1;
                }
            } else if (direction === DOWN) {
                if (this.y + this.data.height >= this._globals.XPenguinsWindow.get_height()) {
                    return 1;
                }
            } // switch(direction)
        } // if edge_block

        if (direction === HERE) {
            return this._globals.toon_windows.overlaps(this.x, this.y,
                        this.data.width, this.data.height);
        } else if (direction === LEFT) {
            return this._globals.toon_windows.overlaps(this.x - 1, this.y,
                      1, this.data.height);
        } else if (direction === RIGHT) {
            return this._globals.toon_windows.overlaps(this.x + this.data.width,
                      this.y, 1, this.data.height);
        } else if (direction === UP) {
            return this._globals.toon_windows.overlaps(this.x, this.y - 1,
                      this.data.width, 1);
        } else if (direction === DOWN) {
            return this._globals.toon_windows.overlaps(this.x,
                      this.y + this.data.height,
                      this.data.width, 1);
        } else {
            return -1;
        }
    }, // blocked

    /* Returns true the toon would be in an occupied area
     * if moved by xoffset and yoffset, false otherwise.
     * ToonOffsetBlocked
     */
    offsetBlocked: function (xoffset, yoffset) {
        if (this._globals.edge_block) {
            if ((this.x + xoffset <= 0)
                    || (this.x + this.data.width + xoffset >= this._globals.XPenguinsWindow.get_width())
                    || ((this.y + yoffset <= 0) && this._globals.edge_block !== SIDEBOTTOMBLOCK)
                    || (this.y + this.data.height + yoffset >= this._globals.XPenguinsWindow.get_height())) {
                return true;
            }
        }
        return this._globals.toon_windows.overlaps(this.x + xoffset, this.y + yoffset,
                    this.data.width, this.data.height);
    },

    /* Check to see if a toon would be squashed instantly if changed to
     *  certain type, return true if squashed, false otherwise.
     *  Useful to call before ToonSetType().
     * ToonCheckBlocked
     */
    checkBlocked: function (type, gravity) {
        let newpos = this.calculateNewPosition(this.genus, type, gravity),
            newdata = this._globals.toonData[this.genus][type];
        return this._globals.toon_windows.overlaps(newpos[0], newpos[1], newdata.width, newdata.height);
    },

    /**** MORPHING FUNCTIONS ****/
    /* Turn a penguin into a climber */
    // __xpenguins_make_climber
    makeClimber: function () {
        this.setType('climber', this.direction, (this.direction ? DOWNRIGHT : DOWNLEFT));
        this.setAssociation(this.direction);
        this.setVelocity(0, -this.data.speed);
    },

    /* Turn a penguin into a walker. To ensure that a climber turning
     * into a walker does not loose its footing, set shiftforward
     * to 1 (otherwise 0)
     */
    // __xpenguins_make_walker
    makeWalker: function (shiftforward) {
        let gravity = (shiftforward ?
                        (this.direction ? DOWNRIGHT : DOWNLEFT) :
                        DOWN),
            newtype = 'walker';
        // 25%  chance of becoming a runner
        if (this._globals.toonData[this.genus].runner && !XPUtil.RandInt(4)) {
            newtype = 'runner';
            /* Sometimes runners are larger than walkers: check for immediate squash */
            if (this.checkBlocked(newtype, gravity)) {
                newtype = 'walker';
            }
        }
        this.setType(newtype, this.direction, gravity);
        this.setAssociation(DOWN);
        this.setVelocity(this.data.speed * (2 * this.direction - 1), 0);
    },

    /* Turn penguin into a faller
     * __xpenguins_make_faller
     */
    makeFaller: function () {
        this.setType('faller', this.direction, UP);
        this.setVelocity(this.direction * 2 - 1, this.data.speed);
        this.setAssociation(UNASSOCIATED);
    },

    /**** HANDLING TOON ASSOCIATIONS WITH MOVING WINDOWS (toon_associate.c) ****/
    /* The first thing to be done when the windows move is to work out
       which windows the associated toons were associated with just before
       the windows moved
       ToonCalculateAssocations.
       Currently this function always returns 0 */
    calculateAssociations: function () {
        if (this.associate !== UNASSOCIATED && this.active) {
            /* determine the position of a line of pixels that
             * the associated window should at least partially enclose
             */
            let x, y, width, height;
            if (this.associate === DOWN) {
                x = this.x;
                y = this.y + this.data.height;
                width = this.data.width;
                height = 1;
            } else if (this.associate === UP) {
                x = this.x;
                y = this.y - 1;
                width = this.data.width;
                height = 1;
            } else if (this.associate === LEFT) {
                x = this.x - 1;
                y = this.y;
                width = 1;
                height = this.data.height;
            } else if (this.associate === RIGHT) {
                x = this.x + this.data.width;
                y = this.y;
                width = 1;
                height = this.data.height;
            } else {
                throw new Error(_("Error: illegal direction %d".format(this.associate)));
            } // switch(this.associate)
            this.wid = -1;

            /* work out which window the toon is sitting/climbing/walking on
             * and when the window shifts by less than toon_relocate_max,
             * move the toon with it (hence xoffset, yoffset)
             */
            let w = this._globals.toon_windows.rectangles;
            for (let i = 0; i < w.length; ++i) {
                if (w[i].x < x + width &&
                        w[i].x + w[i].width > x &&
                        w[i].y < y + height &&
                        w[i].y + w[i].height > y) {
                    this.wid = w[i].wid;
                    this.xoffset = this.x - w[i].x;
                    this.yoffset = this.y - w[i].y;
                    break;
                }
            }
        }
    }, // calculateAssociations

    /* After calling ToonLocateWindows() we relocate all toons that were
     * associated with particular windows.
     * ToonRelocateAssociated
     */
    relocateAssociated: function () {
        let i, dx, dy,
            w = this._globals.toon_windows.rectangles;
        if (this.associate !== UNASSOCIATED &&
                this.wid >= 0 && this.active) {
            for (i = 0; i < this._globals.toon_windows.rectangles.length; ++i) {
                if (this.wid === w[i].wid) {
                    dx = this.xoffset + w[i].x - this.x;
                    dy = this.yoffset + w[i].y - this.y;
                    if (dx < this._globals.max_relocate_right &&
                            -dx < this._globals.max_relocate_left &&
                            dy < this._globals.max_relocate_down &&
                            -dy < this._globals.max_relocate_up) {
                        if (!this.offsetBlocked(dx, dy)) {
                            this.actor.move_by(dx, dy);
                        }
                    }
                    break;
                }
            }
        }
    },

    /***** CORE FUNCTIONS *****/
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
    advance: function (mode) {
        let move_ahead = (mode === STILL ? false : true),
            newx = this.x + this.u,
            newy = this.y + this.v,
            stationary = (this.u === 0 && this.v === 0),
            result = OK;

        if (this._globals.edge_block) {
            if (newx < 0) {
                newx = 0;
                result = PARTIALMOVE;
            } else if (newx + this.data.width > this._globals.XPenguinsWindow.get_width()) {
                newx = this._globals.XPenguinsWindow.get_width() - this.data.width;
                result = PARTIALMOVE;
            }
        }
        if (!(this.data.conf & NOBLOCK)) {
            /* Consider all blocking: additionally y */
            if (this._globals.edge_block) {
                if (newy < 0 && this._globals.edge_block !== SIDEBOTTOMBLOCK) {
                    newy = 0;
                    result = PARTIALMOVE;
                } else if (newy + this.data.height > this._globals.XPenguinsWindow.get_height()) {
                    newy = this._globals.XPenguinsWindow.get_height() - this.data.height;
                    result = PARTIALMOVE;
                }
                if (newx === this.x && newy === this.y && !stationary) {
                    result = BLOCKED;
                }
            }

            /* Is new toon location fully/partially filled with windows? */
            if (this._globals.toon_windows.overlaps(newx, newy, this.data.width, this.data.height) && mode === MOVE &&
                    result !== BLOCKED && !stationary) {
                let tryx, tryy,
                    step = 1,
                    u = newx - this.x,
                    v = newy - this.y;
                result = BLOCKED;
                move_ahead = false;
                /* How far can we move the toon? */
                if (Math.abs(v) < Math.abs(u)) {
                    if (newx > this.x) {
                        step = -1;
                    }
                    for (tryx = newx + step; tryx !== this.x; tryx += step) {
                        tryy = this.y + (tryx - this.x) * v / u;
                        if (!this._globals.toon_windows.overlaps(tryx, tryy, this.data.width, this.data.height)) {
                            newx = tryx;
                            newy = tryy;
                            result = PARTIALMOVE;
                            move_ahead = true;
                            break;
                        }
                    }
                } else {
                    if (newy > this.y) {
                        step = -1;
                    }
                    for (tryy = newy + step; tryy !== this.y; tryy += step) {
                        tryx = this.x + (tryy - this.y) * u / v;
                        if (!this._globals.toon_windows.overlaps(tryx, tryy, this.data.width, this.data.height)) {
                            newx = tryx;
                            newy = tryy;
                            result = PARTIALMOVE;
                            move_ahead = true;
                            break;
                        }
                    }
                }
            }
        } /* what sort of blocking to consider */
        //XPUtil.DEBUG('toon.advance: moving from (%d,%d) to (%d,%d)'.format(this.x, this.y, newx, newy));
        if (move_ahead) {
            this.actor.set_position(newx, newy);
            // see if we've scrolled to the end of the filmstrip
            if ((++this.frame) >= this.data.nframes) {
                this.frame = 0;
                ++(this.cycle);
                if (this.data.conf & NOCYCLE) {
                    this.active = false;
                }
            }
        } else if (this.data.conf & NOCYCLE) {
            if ((++this.frame) >= this.data.nframes) {
                this.frame = 0;
                this.cycle = 0;
                this.active = false;
            }
        }
        return result;
    }, // advance

    /* Draws the current toon */
    draw: function () {
        /* Draw the toon on */
        if (this.active) {
            let direction = (this.direction >= this.data.ndirections ? 0 : this.direction),
                anchor_x = this.data.width * this.frame,
                anchor_y = this.data.height * direction;

            this.actor.set_anchor_point(anchor_x, anchor_y);
            /* clip is measured from top-left of pixmap */
            this.actor.set_clip(anchor_x, anchor_y,
                                this.data.width, this.data.height);
        }
    },

    /* remove reference to global vars */
    _onDestroy: function () {
        delete this._globals;
    },

    destroy: function () {
        this.actor.destroy();
    }
}; // Toon.prototype

/********************************************************************
 * The ToonData structure describes the properties of a type of toon,
 * such as walker, climber etc. 
 * It contains a Clutter.Texture holding the pixmap.
 ********************************************************************/
function ToonData() {
    this._init.apply(this, arguments);
};
ToonData.prototype = {

    /* __xpenguins_copy_properties */
    _init: function (otherToonData) {
        /* Properties: set default values */
        this.conf = DEFAULTS;      /* bitmask of toon properties such as cycling etc */
        this.texture = null; /* Clutter.Texture, replaces .image, .mask and .pixmap */

        // .master is needed to make sure all clones point to the one same source.
        this.master = null;             /* If pixmap data is duplicated from another toon, this is it */
        this.nframes = 0;               /* number of frames in image */
        this.ndirections = 1;           /* number directions in image (1 or 2) */
        this.width = this.height = 30;  /* width & height of individual frame/dir */
        this.acceleration = this.terminal_velocity = 0;
        this.speed = 4;
        this.loop = 0;                  /* Number of times to repeat cycle */

        /* Copy select properties from otherToonData to here. */
        let propListToCopy = ['nframes', 'ndirections', 'width', 'height',
                              'acceleration', 'speed', 'terminal_velocity',
                              'conf', 'loop', 'master'],
            i = propListToCopy.length;
        /* Copy select properties from otherToonData to here. */
        if (otherToonData) {
            while (i--) {
                this[propListToCopy[i]] = otherToonData[propListToCopy[i]];
            }
        }
    },

    setMaster: function (master) {
        this.master = master;
        this.texture = master.texture;
        this.texture.connect('destroy', Lang.bind(this, this._onDestroy));
    },

    loadTexture: function (filename) {
        this.texture = Clutter.Texture.new_from_file(filename);
    },

    get filename() {
        if (this.texture) {
            return this.texture.filename;
        } else {
            return null;
        }
    },

    _onDestroy: function () {
        /* remove reference to master and texture */
        if (this.master) {
            delete this.master;
            delete this.texture;
        }
    },

    destroy: function () {
        if (this.texture) {
            this.texture.destroy();
        }
    }
};
