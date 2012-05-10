TOON = {
    UNASSOCIATED: -2,
    HERE: -1,
    LEFT: 0,
    RIGHT: 1,
    UP: 2,
    DOWN: 3,
    UPLEFT: 4,
    UPRIGHT: 5,
    DOWNLEFT: 6,
    DOWNRIGHT: 7,

    FORCE: 1,
    MOVE: 0,
    STILL: -1,

    OK: 1,
    PARTIALMOVE: 0,
    BLOCKED: -1,
    SQUASHED: -2,

/* General configuration options */
    DEFAULTS: 0L,

    NOEDGEBLOCK: (1<<0),
    EDGEBLOCK: (1<<1),
    SIDEBOTTOMBLOCK: (1<<2),
    NOSOLIDPOPUPS: (1<<4),
    SOLIDPOPUPS: (1<<5),
    NOSHAPEDWINDOWS: (1<<6),
    SHAPEDWINDOWS: (1<<7),
    SQUISH: (1<<8),
    NOSQUISH: (1<<9),

    NOCATCHSIGNALS: (1<<16),
    CATCHSIGNALS: (1<<17),
    EXITGRACEFULLY: (1<<18),

/* Configuration for individual toon types */
    NOCYCLE: (1<<0),
    INVULNERABLE: (1<<1),
    NOBLOCK: (1<<2),

    MESSAGE_LENGTH: 128,
    DEFAULTMAXRELOCATE: 8
};

/**********************************/
/* The Toon structure describes the properties of a particular toon,
 * such as its location and speed */
/**********************************/

function Toon() {
    this._init.apply(this, arguments);
}
Toon.prototype = {
    _init: function() {
        /* new position and velocity */
        this.x = this.y = this.u = this.v = 0;
        this.genus = this.type = this.frame = this.direction = null;
        this.x_map = this.y_map = null;
        this.width_map = this.height_map = null;
        /* properties of the image mapped on the screen */
        this.associate = false; /* toon is associated with a window */
        this.xoffset = this.yoffset = 0; /* location relative to window origin */
        this.wid = null; /* window associated with */
        this.cycle = 0; /* Number of times frame cycle has repeated */
        this.pref_direction = null;
        this.pref_climb = null;
        this.hold = null;
        this.active = false;
        this.terminating = false;
        this.mapped = false;
        this.squished = false;
        //Pixmap background;   /* @@ storing the background so we can repaint where we've been */
    }
}

/**********************************/
/* The ToonData structure describes the properties of a type of toon,
 * such as walker, climber etc. */
/**********************************/
function ToonData() {
    this._init.apply(this, arguments);
}
/* Glorified object with init function */
ToonData.prototype = {
    _init: function(otherToonData) {
        /* Properties */
        this.conf = 0; /* bitmask of toon properties such as cycling etc */
        this.image = null;
        this.filename = null; /* Name of image file name */
        this.master = null; /* If pixmap data is duplicated from another toon, this is it */
        this.pixmap = this.mask = null; /* pointers to X structures */
        this.nframes = 0; /* number of frames in image */
        this.ndirections = 1; /* number directions in image (1 or 2) */
        this.width = this.height = 0; /* width & height of individual frame/dir */
        this.acceleration = this.speed = this.terminal_velocity = 0;
        this.loop = 0; /* Number of times to repeat cycle */
        // TODO (small) : need 'exists' ?
        this.exists = false;

        /* Copy select properties from otherToonData to here. */
        if ( otherToonData ) {
            let propListToCopy = ['nframes', 'ndirections', 'width', 'height',
                                  'acceleration', 'speed', 'terminal_velocity',
                                  'conf', 'loop', 'master'];
            for ( let i=propListToCopy.length; --i; ) {
                this[propListToCopy[i]] = otherToonData[propListToCopy[i]];
            }
        }

    }
};

