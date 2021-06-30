let session_storage = (() => {
    try {
        return window.sessionStorage || {};
    } catch (e) {
        const storage = {};
        return {
            getItem: item => storage[item],
            setItem: (item,value) => storage[item] = value,
        };
    }
})(),
    diary_strings = (
      session_storage.getItem('dashboard.diary') || ''
    ).split("\n").filter( d => d.length ),
    /*
     * Vue likes to make variables reactive.
     * This is extremely expensive for large, complex structures like diaries.
     * So we manage diaries outside of Vue:
     */
    diaries = [],
    permanent_callbacks = [],
    callbacks = [],
    init_waiting,
    init_callbacks = [],
    sentinel = {},
    id = 0,
    current_file,
    diary_loader = new window.DiaryLoader(
        (diary,source) => {
            current_file = 0;
            diaries.push([id++,diary,diary.format_info()]);
            permanent_callbacks.forEach( c => c(diaries.length == 1 && diary_strings.length == 0) );
            callbacks.forEach( c => c(diaries.length == 1 && diary_strings.length == 0) );
            callbacks.length = 0;
            if ( init_callbacks && !--init_waiting ) {
                init_callbacks.forEach( c => c() );
                init_callbacks = 0;
            }
            if ( source && source !== sentinel ) {
                diary.to_async("storage-line").then( json => {
                    diary_strings.push(json);
                    session_storage.setItem('dashboard.diary',diary_strings.join("\n"));
                });
            }
        },
        () => {
            let fail = () => {
                callbacks.forEach( c => c(diaries.length == 1 && diary_strings.length == 0,true) );
                callbacks.length = 0;
            },
                file = current_file;
            current_file = 0;
            if ( window.preprocess_activity_log && window.Promise ) {
                window.preprocess_activity_log(file)
                    .then(
                        activities => {
                            diary_loader.load(
                                "ActivityStart,ActivityEnd\n"
                                + activities.map( a => a.ActivityStart+','+a.ActivityEnd).join("\n")
                                + "\n"
                            );
                        },
                        fail
                    );
            } else {
                fail();
            }
        },
        1, // parse each URL hash once, but not when the user clicks "back"
    )
;

if ( diary_strings.length ) {
    init_waiting = diary_strings.length;
    diary_strings
        .forEach( str => diary_loader.load(str,sentinel) )
    ;
} else {
    init_callbacks = 0;
}

export default {

    on_init(c) {
        if ( init_callbacks ) {
            init_callbacks.push(c);
        } else {
            c(diaries.length);
        }
    },
    get_diaries() { return diaries; },
    merge_diaries() {
        if ( !diaries.length ) return;
        const ret = diaries[0][1].clone();
        diaries.slice(1).forEach( d => ret.merge(d[1]) );
        return ret;
    },
    add_callback(c) { callbacks.push(c); },
    add_permanent_callback(c) { permanent_callbacks.push(c); },
    add_diary(event) {
        diary_loader.load(event);
        current_file = event.target.files[0];
    },
    remove_diary(id) {
        for ( let n=0; n!=diaries.length; ++n ) {
            if ( diaries[n][0] == id ) {
                diaries.splice(n,1);
                diary_strings.splice(n,1);
                session_storage.setItem('dashboard.diary',diary_strings.join("\n"));
                permanent_callbacks.forEach( c => c(diaries.length == 1 && diary_strings.length == 0) );
                return;
            }
        }
    },

};