/*
 *
 *
 *
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

const Clutter = imports.gi.Clutter;

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
Toon.NOEDGEBLOCK = 0;
Toon.EDGEBLOCK = (1 << 1);
Toon.SIDEBOTTOMBLOCK = (1 << 2);

/* Configuration for individual toon types */
Toon.DEFAULTS = 0;
Toon.NOCYCLE = (1 << 0);
Toon.INVULNERABLE = (1 << 1);
Toon.NOBLOCK = (1 << 2);


/**********************************
 * The Toon structure describes the
 * properties of a particular toon,
 * such as its location and speed
 **********************************/
/*
 * NOTE: in GNOME 3.2 you can't subclass GObjects,
 * & hence cannot subclass Clutter.Clone:
 * will need to have a Toon.actor being the clone.
 */
/*
 * For GNOME 3.4:
Toon.Toon = new Lang.Class({
    Name: 'Toon',
    Extends: Clutter.Clone,
    _init: ....
});
*
*/
Toon.Toon = function () {
    this._init.apply(this, arguments);
};

Toon.Toon.prototype = {
    _init: function (globalvars, props, params) {
        /* __xpenguins_init_penguin(Toon *p) */
        // For GNOME 3.2, will have to store this.actor.
        this.actor = new Clutter.Clone(params || {});
        // mark it as mine
        this.actor.toon_object = this;

        /* initialisation */
        this.u = this.v = 0; /* velocity */
        this.genus = null;
        this.type = 'faller';
        this.direction = null;

        /* properties of the image mapped on the screen */
        this.x_map = this.y_map = 0;
        this.width_map = this.height_map = 1;


        this.associate = Toon.UNASSOCIATED; /* toon is associated with a window */
        this.wid = null; /* window associated with */

        //this.xoffset = this.yoffset = 0; /* location relative to window origin */

        this.frame = 0; /* Frame we're up to in the animation */
        this.cycle = 0; /* Number of times frame cycle has repeated */

        this.pref_direction = -1;
        this.pref_climb = false;
        this.active = false;
        this.terminating = false; /* whether toon is not to be respawned */
        this.squished = false;

        // UGLY way to pass in the theme/toon data/stage info/parameters.
        /* needs:
         * XPenguinsWindowWidth
         * XPenguinsWindowHeight
         * ToonData
         * toon_windows
         * etc.
         * BIG BIG BIG BIGTODO: .ToonData references are now bad.
         *  (also, is it *expensive* to carry a reference around in each toon?)
         */
        this.GLOBAL = globalvars;

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
            // TODO: CLONE NEEDS SIZE SET
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
        log(('TOON.INIT: genus: ' + this.genus + ' type: ' + this.type));

        this.direction = XPUtil.RandInt(2);
        this.set_type('faller', this.direction, Toon.UNASSOCIATED);
        this.actor.set_position(XPUtil.RandInt(this.GLOBAL.XPenguinsWindow.get_width() - this.data.width), 1 - this.data.height);
        this.set_association(Toon.UNASSOCIATED);
        this.set_velocity(this.direction * 2 - 1, this.data.speed);
        this.terminating = false;
        // TODO: is this right?
        // this.actor.set_size(this.data.width, this.data.height); // will change every time toon changes?
    },

    // TODO: get data() vs storing .data (performance)
    get data() {
        // GOTCHA: this.genus can be 0.
        if (this.genus !== null && this.type) {
            return this.GLOBAL.ToonData[this.genus][this.type];
        } else {
            return null;
        }
    },

    /**** ASSIGNMENT FUNCTIONS (toon_set.c) ****/
    /* ToonSetType */
    set_type: function (type, direction, gravity) {
        log('  toon changing from %s to %s'.format(this.type, type));
        this.set_genus_and_type(this.genus, type, direction, gravity);
    },

    /* Change a toons genus and type and activate it. */
    /* Gravity determines position offset of toon if size different from
     * previous type.
     * ToonSetGenusAndType */
    set_genus_and_type: function (genus, type, direction, gravity) {
        let new_position = this.calculate_new_position(genus, type, gravity);
        this.actor.set_position(new_position[0], new_position[1]);
        this.type = type;
        this.genus = genus;
        this.cycle = 0;
        this.direction = direction;
        this.frame = 0;
        this.active = true;
        this.actor.set_source(this.data.texture);
        // TODO: this.actor.set_size
    },

    /* Set a toons association direction - e.g. Toon_DOWN if the toon
       is walking along the tops the window, Toon_UNASSOCIATED if
       the toon is in free space */
    // ToonSetAssocation
    set_association: function (direction) {
        this.associate = direction;
    },

    // ToonSetVelocity
    set_velocity: function (u, v) {
        this.u = u;
        this.v = v;
    },

    /**** QUERY FUNCTIONS (toon_query.c) ****/
    /* Calculates the new x and y when a toon changes type/genus
     * Used in both SetGenusAndType and CheckBlocked.
     * Returns array [newx, newy].
     */
    calculate_new_position: function (genus, type, gravity) {
        let newdata = this.GLOBAL.ToonData[genus][type],
            x = this.x,
            y = this.y;
        if (gravity === Toon.HERE) {
            x += Math.round((this.data.width - newdata.width) / 2);
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === Toon.DOWN) {
            x += Math.round((this.data.width - newdata.width) / 2);
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === Toon.UP) {
            x += Math.round((this.data.width - newdata.width) / 2);
        } else if (gravity === Toon.LEFT) {
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === Toon.RIGHT) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height) / 2);
        } else if (gravity === Toon.DOWNLEFT) {
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === Toon.DOWNRIGHT) {
            x += Math.round((this.data.width - newdata.width));
            y += Math.round((this.data.height - newdata.height));
        } else if (gravity === Toon.UPRIGHT) {
            x += Math.round((this.data.width - newdata.width));
        }
        return [x, y];
    },

    /* Returns 1 if the toon is blocked in the specified direction,
     * 0 if not blocked and -1 if the direction argument was out of bounds
     * ToonBlocked
     */
    Blocked: function (direction) {
        if (this.GLOBAL.edge_block) {
            if (direction === Toon.LEFT) {
                if (this.x <= 0) {
                    return 1;
                }
            } else if (direction === Toon.RIGHT) {
                if (this.x + this.data.width >= this.GLOBAL.XPenguinsWindow.get_width()) {
                    return 1;
                }
            } else if (direction === Toon.UP) {
                if (this.y <= 0) {
                    return 1;
                }
            } else if (direction === Toon.DOWN) {
                if (this.y + this.data.height >= this.GLOBAL.XPenguinsWindow.get_height()) {
                    return 1;
                }
            } // switch(direction)
        } // if edge_block

        if (direction === Toon.HERE) {
            return this.GLOBAL.toon_windows.overlaps(this.x, this.y,
                        this.data.width, this.data.height);
        } else if (direction === Toon.LEFT) {
            return this.GLOBAL.toon_windows.overlaps(this.x - 1, this.y,
                      1, this.data.height);
        } else if (direction === Toon.RIGHT) {
            return this.GLOBAL.toon_windows.overlaps(this.x + this.data.width,
                      this.y, 1, this.data.height);
        } else if (direction === Toon.UP) {
            return this.GLOBAL.toon_windows.overlaps(this.x, this.y - 1,
                      this.data.width, 1);
        } else if (direction === Toon.DOWN) {
            return this.GLOBAL.toon_windows.overlaps(this.x,
                      this.y + this.data.height,
                      this.data.width, 1);
        } else {
            return -1;
        }
    }, // Blocked

    /* Returns true the toon would be in an occupied area
     * if moved by xoffset and yoffset, false otherwise.
     * ToonOffsetBlocked
     */
    OffsetBlocked: function (xoffset, yoffset) {
        if (this.GLOBAL.edge_block) {
            if ((this.x + xoffset <= 0)
                    || (this.x + this.data.width + xoffset >= this.GLOBAL.XPenguinsWindow.get_width())
                    || ((this.y + yoffset <= 0) && this.GLOBAL.edge_block !== Toon.SIDEBOTTOMBLOCK)
                    || (this.y + this.data.height + yoffset >= this.GLOBAL.XPenguinsWindow.get_height())) {
                return true;
            }
        }
        return this.GLOBAL.toon_windows.overlaps(this.x + xoffset, this.y + yoffset,
                    this.data.width, this.data.height);
    },

    /* Check to see if a toon would be squashed instantly if changed to
     *  certain type, return true if squashed, false otherwise.
     *  Useful to call before ToonSetType().
     * ToonCheckBlocked
     */
    CheckBlocked: function (type, gravity) {
        let newpos = this.calculate_new_position(this.genus, type, gravity),
            newdata = this.GLOBAL.ToonData[this.genus][type];
        return this.GLOBAL.toon_windows.overlaps(newpos[0], newpos[1], newdata.width, newdata.height);
    },

    /**** MORPHING FUNCTIONS ****/
    /* Turn a penguin into a climber */
    // __xpenguins_make_climber
    make_climber: function () {
        this.set_type('climber', this.direction, (this.direction ? Toon.DOWNRIGHT : Toon.DOWNLEFT));
        this.set_association(this.direction);
        this.set_velocity(0, -this.data.speed); // this.data is now CLIMBER
    },

    /* Turn a penguin into a walker. To ensure that a climber turning
     * into a walker does not loose its footing, set shiftforward
     * to 1 (otherwise 0)
     */
    // __xpenguins_make_walker
    make_walker: function (shiftforward) {
        let gravity = (shiftforward ?
                        (this.direction ? Toon.DOWNRIGHT : Toon.DOWNLEFT) :
                        Toon.DOWN),
            newtype = 'walker';
        // 25%  chance of becoming a runner
        if (this.GLOBAL.ToonData[this.genus].runner && !XPUtil.RandInt(4)) {
            newtype = 'runner';
            /* Sometimes runners are larger than walkers: check for immediate squash */
            if (this.CheckBlocked(newtype, gravity)) {
                newtype = 'walker';
            }
        }
        this.set_type(newtype, this.direction, gravity);
        this.set_association(Toon.DOWN);
        this.set_velocity(this.data.speed * (2 * this.direction - 1), 0);
    },

    /* Turn penguin into a faller
     * __xpenguins_make_faller
     */
    make_faller: function () {
        this.set_type('faller', this.direction, Toon.UP);
        this.set_velocity(this.direction * 2 - 1, this.data.speed);
        this.set_association(Toon.UNASSOCIATED);
    },

    /**** HANDLING TOON ASSOCIATIONS WITH MOVING WINDOWS (toon_associate.c) ****/
    /* The first thing to be done when the windows move is to work out
       which windows the associated toons were associated with just before
       the windows moved
       ToonCalculateAssocations.
       Currently this function always returns 0 */
    CalculateAssociations: function () {
        if (this.associate !== Toon.UNASSOCIATED && this.active) {
            /* determine the position of a line of pixels that
             * the associated window should at least partially enclose
             */
            let x, y, width, height,
                w = this.GLOBAL.toon_windows;
            if (this.associate === Toon.DOWN) {
                x = this.x;
                y = this.y + this.data.height;
                width = this.data.width;
                height = 1;
            } else if (this.associate === Toon.UP) {
                x = this.x;
                y = this.y - 1;
                width = this.data.width;
                height = 1;
            } else if (this.associate === Toon.LEFT) {
                x = this.x - 1;
                y = this.y;
                width = 1;
                height = this.data.height;
            } else if (this.associate === Toon.RIGHT) {
                x = this.x + this.data.width;
                y = this.y;
                width = 1;
                height = this.data.height;
            } else {
                throw new Error(_('Error: illegal direction %d'.format(this.associate)));
            } // switch(this.associate)
            this.wid = 0;

            // TODO
            for (let i = 0; i < this.GLOBAL.toon_windows.length; ++i) {
                // TODO: solid?
                if (w[i].solid &&
                        w[i].x < x + width &&
                        w[i].x + w[i].width > x &&
                        w[i].y < y + height &&
                        w[i].y + w[i].height < y) {
                    this.wid = w[i].wid;
                    this.xoffset = this.x - w[i].x;
                    this.yoffset = this.y - w[i].y;
                    break;
                }
            }
            // BIG TODO: what's the xoffset/yoffset for? do I need it?
        }
    }, // CalculateAssociations

    /* After calling ToonLocateWindows() we relocate
     * all the toons that were
     * associated with particular windows
     * ToonRelocateAssociated
     */
    RelocateAssociated: function () {
        let i, dx, dy,
            w = this.GLOBAL.toon_windows;
        if (this.associate !== Toon.UNASSOCIATED &&
                this.wid !== 0 && this.active) {
            for (i = 0; i < this.GLOBAL.toon_windows.length; ++i) {
                // TODO: I don't need to loop. just store the index??
                // or does toon_windows change in between
                if (this.wid === w[i].wid && w[i].solid) {
                    dx = this.xoffset + w[i].x - this.x;
                    dy = this.yoffset + w[i].y - this.y;
                    if (dx < this.GLOBAL.toon_max_relocate_right &&
                            -dx < this.GLOBAL.toon_max_relocate_left &&
                            dy < this.GLOBAL.toon_max_relocate_down &&
                            -dy < this.GLOBAL.toon_max_relocate_up) {
                        if (!this.OffsetBlocked(dx, dy)) {
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
    Advance: function (mode) {
    //    log('Advance');
        let move_ahead = (mode === Toon.STILL ? false : true),
            newx = this.x + this.u,
            newy = this.y + this.v,
            stationary = (this.u === 0 && this.v === 0),
            result = Toon.OK;

        if (this.GLOBAL.edge_block) {
            if (newx < 0) {
                newx = 0;
                result = Toon.PARTIALMOVE;
            } else if (newx + this.data.width > this.GLOBAL.XPenguinsWindow.get_width()) {
                newx = this.GLOBAL.XPenguinsWindow.get_width() - this.data.width;
                result = Toon.PARTIALMOVE;
            }
        }
        if (!(this.data.conf & Toon.NOBLOCK)) {
            /* Consider all blocking: additionally y */
            if (this.GLOBAL.edge_block) {
                if (newy < 0 && this.GLOBAL.edge_block !== Toon.SIDEBOTTOMBLOCK) {
                    newy = 0;
                    result = Toon.PARTIALMOVE;
                } else if (newy + this.data.height > this.GLOBAL.XPenguinsWindow.get_height()) {
                    newy = this.GLOBAL.XPenguinsWindow.get_height() - this.data.height;
                    result = Toon.PARTIALMOVE;
                }
                if (newx === this.x && newy === this.y && !stationary) {
                    result = Toon.BLOCKED;
                }
            }

            /* Is new toon location fully/partially filled with windows? */
            if (this.GLOBAL.toon_windows.overlaps(newx, newy, this.data.width, this.data.height) && mode === Toon.MOVE &&
                    result !== Toon.BLOCKED && !stationary) {
                let tryx, tryy,
                    step = 1,
                    u = newx - this.x,
                    v = newy - this.y;
                result = Toon.BLOCKED;
                move_ahead = false;
                /* How far can we move the toon? */
                if (Math.abs(v) < Math.abs(u)) {
                    if (newx > this.x) {
                        step = -1;
                    }
                    for (tryx = newx + step; tryx !== this.x; tryx += step) {
                        tryy = this.y + (tryx - this.x) * v / u;
                        // why the '!'?
                        if (!this.GLOBAL.toon_windows.overlaps(tryx, tryy, this.data.width, this.data.height)) {
                            newx = tryx;
                            newy = tryy;
                            result = Toon.PARTIALMOVE;
                            move_ahead = true;
                            break;
                        }
                    }
                // faster vertically than horiz
                } else {
                    if (newy > this.y) {
                        step = -1;
                    }
                    for (tryy = newy + step; tryy !== this.y; tryy += step) {
                        tryx = this.x + (tryy - this.y) * u / v;
                        if (!this.GLOBAL.toon_windows.overlaps(tryx, tryy, this.data.width, this.data.height)) {
                            newx = tryx;
                            newy = tryy;
                            result = Toon.PARTIALMOVE;
                            move_ahead = true;
                            break;
                        }
                    }
                }

                /*
                 * Compresses the above into one step.

                xy = this.xy; // <-- ???
                MAJ = (Math.abs(uv[1]) < Math.abs(uv[0]) ? 0 : 1);
                MIN = 1-MAJ;
                if (newxy[MAJ] > xy[MAJ]) {
                    step = -1;
                }
                let tryMAX, tryMIN, tryxy = [], step;
                for (tryMAX = newxy[MAJ]+step; tryMAX != xy[MAJ]; tryMAX += step) {
                    tryMIN = xy[MIN] + (tryMAX-xy[MAJ])*uv[MIN]/uv[MAX];
                    tryxy[MAX] = tryMAX;
                    tryxy[MIN] = tryMIN;
                    if (!this.GLOBAL.toon_windows.overlaps(tryxy[0], tryxy[1], this.data.width, this.data.height)) {
                        newxy = tryxy;
                        result = Toon.PARTIALMOVE;
                        move_ahead = true;
                        break;
                    }
                }
                */
            }
        } /* what sort of blocking to consider */

        //log('toon.Advance: moving from (%d,%d) to (%d,%d)'.format(this.x, this.y, newx, newy));
        if (move_ahead) {
            this.actor.set_position(newx, newy);
            // see if we've scrolled to the end of the filmstrip
            if ((++this.frame) >= this.data.nframes) {
                this.frame = 0;
                ++(this.cycle);
                // NOCYCLE is associated with a ToonData.
                if (this.data.conf & Toon.NOCYCLE) {
                    this.active = false;
                }
            }
        } else if (this.data.conf & Toon.NOCYCLE) {
            if ((++this.frame) >= this.data.nframes) {
                this.frame = 0;
                this.cycle = 0;
                this.active = false;
            }
        }
        return result;
    }, // advance

    /* Draws the current toon */
    Draw: function () {
        /* Draw the toon on */
        if (this.active) {
            // FIXME: do I set this.direction to direction?
            let direction = (this.direction >= this.data.ndirections ? 0 : this.direction),
                anchor_x = this.data.width * this.frame,
                anchor_y = this.data.height * direction;

            this.actor.set_anchor_point(anchor_x, anchor_y);
            /* clip is measured from top-left of pixmap */
            this.actor.set_clip(anchor_x, anchor_y,
                                this.data.width, this.data.height);
            /* Draw on the screen.... .show() should take care of that already? */

            /* update properties */
            // TODO: what are these for?
            this.x_map = this.x;
            this.y_map = this.y;
            this.width_map = this.data.width;
            this.height_map = this.data.height;
            //this.mapped = true;
        }
    },

    /* ToonErase : not needed (actual drawing/expose events
     * is taken care of by the actor) */

    destroy: function () {
        /* remove reference to global vars */
        this.GLOBAL = null;

        /* destroy actor (in GNOME 3.4: destroy is Clutter.Clone.destroy) */
        this.actor.destroy();
    }
}; // Toon.Toon.prototype

/**********************************/
/* The ToonData structure describes the properties of a type of toon,
 * such as walker, climber etc. */
/**********************************/
Toon.ToonData = function () {
    this._init.apply(this, arguments);
};
/* Note:
 * I tried letting this.pixmap be a the Cogl.Texture of the pixmap,
 *  so that Toons could be Clutter.Texture with set_cogl_texture == ToonData.image
 * However Cogl.Texture.new_from_file() isn't introspectible and
 *  Clutter.Texture.get_cogl_texture() seems not to work (returns 'undefined').
 *
 * Next attempt: ToonData.texture is a Clutter.Texture &
 *  everything else is a Clutter.Clone.
 */
Toon.ToonData.prototype = {

    /* __xpenguins_copy_properties */
    _init: function (otherToonData) {
        /* Properties: set default values */
        this.conf = Toon.DEFAULTS;      /* bitmask of toon properties such as cycling etc */
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
        /* TODO: listen to load-finished signal & load asynchronously */
        let propListToCopy = ['nframes', 'ndirections', 'width', 'height',
                              'acceleration', 'speed', 'terminal_velocity',
                              'conf', 'loop', 'master'],
            i = propListToCopy.length;
        /* Copy select properties from otherToonData to here. */
        /* TODO: listen to load-finished signal & load asynchronously */
        if (otherToonData) {
            while (i--) {
                this[propListToCopy[i]] = otherToonData[propListToCopy[i]];
            }
        }
    },

    set_master: function (master) {
        this.master = master;
        this.texture = master.texture;
    },

    load_texture: function (filename) {
        /* store the Cogl texture in this.pixmap.
         * We can't do Cogl.Texture.new_from_file (not exposed!)
         * so will have to make a Toon.Texture & do get_cogl_texture
         */
        this.texture = Clutter.Texture.new_from_file(filename);
    },

    get filename() {
        if (this.texture) {
            return this.texture.filename;
        } else {
            return null;
        }
    },

    destroy: function () {
        if (this.texture) {
            if (!this.master) {
                this.texture.destroy();
            } else {
                // remove reference to master
                this.master = null;
            }
        }
    }

};

