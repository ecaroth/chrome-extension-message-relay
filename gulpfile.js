"use strict";
const gulp = require('gulp'),
    jshint = require('gulp-jshint'),
      rename = require("gulp-rename"),
      gulpReplace = require('gulp-replace'),
      webserver = require('gulp-webserver'),
      stylish = require('jshint-stylish'),
      argv = require('yargs').argv,
      mocha = require('gulp-mocha'),
      mergeStream = require('merge-stream'),
      insert = require('gulp-insert'),
      uglify = require('gulp-uglify-es').default,
      strip_line = require('gulp-strip-line'),
      exec = require('child_process').exec;

const PACKAGE = require('./package.json');
const {replace} = require("event-stream");
const ATTIBUTION = "/* Version "+PACKAGE.version+" "+PACKAGE.name+" ("+PACKAGE.homepage+"), Authored by "+PACKAGE.author+" */"+"\n\n";
const FNAMES = {
    dev: "message_relay.dev.js",
    build: "message_relay.build.js",
    build_module: "message_relay.build.module.js",
    build_test_module: "message_relay.build.test.js",
    prod: "message_relay.prod.js",
    prod_full: "message_relay.full.prod.js",
    prod_module: "message_relay.prod.module.js"
};

function build_local() {
    return mergeStream(
        gulp.src("dev/" + FNAMES.dev)
            .pipe(strip_line([/\/\*REM\*\//]))
            .pipe(rename(FNAMES.build))
            .pipe(gulp.dest('build')),
        gulp.src("dev/" + FNAMES.dev)
            .pipe(strip_line([/\/\*REM\*\//]))
            .pipe(strip_line([/\/\*REM_MODULE\*\//]))
            .pipe(gulpReplace("/* MODULE_EXPORTS */", "export const relay = "))
            .pipe(rename(FNAMES.build_module))
            .pipe(gulp.dest('build')),
        gulp.src("dev/" + FNAMES.dev)
            .pipe(strip_line([/\/\*REM_MODULE\*\//]))
            .pipe(gulpReplace("/* MODULE_EXPORTS */", "export const relay = "))
            .pipe(rename(FNAMES.build_test_module))
            .pipe(gulp.dest('build')),
        gulp.src('test/pages/**/*')
            .pipe(gulp.dest('build/pages'))
    )
}

//build task to remove test functionality from script
gulp.task("build:prod", gulp.parallel(
    function buildNotest(){
        return gulp.src("dev/" + FNAMES.dev)
            .pipe( strip_line([ /\/\*REM\*\// ]) )
            .pipe( uglify({mangle: true , compress: true}) )
            .pipe( insert.prepend(ATTIBUTION) )
            .pipe( rename(FNAMES.prod) )
            .pipe( gulp.dest('dist') );
    },
    function buildFull() {
        return gulp.src("dev/" + FNAMES.dev)
            .pipe( strip_line([ /\/\*REM\*\// ]) )
            .pipe( insert.prepend(ATTIBUTION) )
            .pipe( rename(FNAMES.prod_full) )
            .pipe( gulp.dest('dist') );
    },
    function buildModule() {
        return gulp.src("dev/" + FNAMES.dev)
            .pipe(strip_line([/\/\*REM\*\//]))
            .pipe(strip_line([/\/\*REM_MODULE\*\//]))
            .pipe(gulpReplace("/* MODULE_EXPORTS */", "export const relay = "))
            .pipe(uglify({mangle: true, compress: true}))
            .pipe(insert.prepend(ATTIBUTION))
            .pipe(rename(FNAMES.prod_module))
            .pipe(gulp.dest('dist'));
    }
));



gulp.task('lint', function(){
  return gulp.src('dev/' + FNAMES.dev)
    .pipe(jshint())
    .pipe(jshint.reporter(stylish))
    .pipe(jshint.reporter('fail'))
    .once('error', () => {
        process.exit(1);
    });
});

gulp.task('lint:build', gulp.series(build_local, function(){
    return gulp.src('build/' + FNAMES.build)
        .pipe(jshint())
        .pipe(jshint.reporter(stylish))
        .pipe(jshint.reporter('fail'))
        .once('error', () => {
            process.exit(1);
        });
}));


//test scripts
// optional --test="search" arg
gulp.task('test', gulp.series(build_local, function(){

    let opts = {
        reporter:'spec',
        fullTrace: true,
        compilers: 'js:babel-core/register'
    }
    var test = argv.test;
    if(test) opts.grep = test;

    return gulp.src('test/**/*.test.js', {read: false})
        .pipe(mocha(opts))
}));

gulp.task('buildModuleTypes', function buildTypesFile(done){
    let cmd = "npx tsc --allowJs --declaration --emitDeclarationOnly ./dist/"+FNAMES.prod_module;
    return exec(cmd, function (err, stdout, stderr) {
        done();
    });
});

gulp.task('build', gulp.series(
    'lint:build',
    'test',
    'build:prod',
    'buildModuleTypes'
));

// Watcher for local file changes to kickoff build
function watch(callback) {
    gulp.watch(['dev/**/*','test/pages/**/*'], build_local);
    callback();
}
gulp.task('watch', watch);
gulp.task('dev', gulp.series(build_local, watch, local_webserver));

// Run connect to serve local resources
function local_webserver() {
    const cors = function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        next();
    };


    return gulp.src('build', {allowEmpty: true})
        .pipe(webserver({
            port: 9000,
            host: '0.0.0.0',
            middleware: [cors]
        }));
}
gulp.task('webserver', local_webserver);
// access via http://localhost:9000/pages/main.html
