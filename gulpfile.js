"use strict";
const gulp = require('gulp'),
	    jshint = require('gulp-jshint'),
      rename = require("gulp-rename"),
      runSequence = require('run-sequence'),
      stylish = require('jshint-stylish'),
      argv = require('yargs').argv,
      mocha = require('gulp-mocha'),
      insert = require('gulp-insert'),
      uglify = require('gulp-uglify-harmony'),
      strip_line = require('gulp-strip-line');

const PACKAGE = require('./package.json');
const ATTIBUTION = "/* Version "+PACKAGE.version+" "+PACKAGE.name+" ("+PACKAGE.homepage+"), Authored by "+PACKAGE.author+" */"+"\n\n";

gulp.task('build', function(cb) {
  runSequence(
  	'lint:dev',
  	'remove_test_deps_and_build',
    'remove_test_deps_and_build_module',
  	'lint:notest',
  	'build_prod',
    'build_prod_module',
    'test',
    cb);
});

//build minified version of notest version and add attribution
gulp.task("build_prod", function(){
	return gulp.src("dev/message_relay.notest.js")
	  .pipe( uglify({mangle: true , compress: true}) )
	  .pipe( insert.prepend(ATTIBUTION) )
	  .pipe( rename("message_relay.prod.js") )
	  .pipe( gulp.dest('dist') );
});

//build minified version of notest version and add attribution
gulp.task("build_prod_module", function(){
  return gulp.src("dev/message_relay.notest.module.js")
    .pipe( uglify({mangle: true , compress: true}) )
    .pipe( insert.prepend(ATTIBUTION) )
    .pipe( insert.append('export {relay};') )
    .pipe( rename("message_relay.prod.module.js") )
    .pipe( gulp.dest('dist') );
});

gulp.task("build_as_module", function(){
  return gulp.src()
})

//build task to remove test functionaity from script
gulp.task("remove_test_deps_and_build", function(){
	//TODO - use gulp-insert to add DEVELOPED BY
  return gulp.src("dev/message_relay.dev.js")
    .pipe( strip_line([ /\/\*REM\*\// ]) )
    .pipe( rename("message_relay.notest.js") )
    .pipe( gulp.dest('dev') );
});

//build task to remove test functionaity from script
gulp.task("remove_test_deps_and_build_module", function(){
  return gulp.src("dev/message_relay.dev.js")
    .pipe( strip_line([ /\/\*REM\*\// ]) )
    .pipe( strip_line([ /\/\*REM_MODULE\*\// ]) )
    .pipe( rename("message_relay.notest.module.js") )
    .pipe( gulp.dest('dev') );
});


gulp.task('lint:notest', function(){
  return gulp.src('dev/message_relay.notest.js')
    .pipe( jshint() )
    .pipe(jshint.reporter(stylish))
    .pipe(jshint.reporter('fail'))
    .once('error', () => {
        process.exit(1);
    });
});


gulp.task('lint:dev', function(){
  return gulp.src('dev/message_relay.dev.js')
    .pipe( jshint() )
    .pipe(jshint.reporter(stylish))
    .pipe(jshint.reporter('fail'))
    .once('error', () => {
        process.exit(1);
    });
});

//run specific gulp test
//NOTE - must pass in --test=<TEST_FILTER> flag!
gulp.task('test_single', ['lint'], function(){
  return gulp.src('test/**/*.test.js', {read: false})
    .pipe(mocha({ignoreLeads: true, fullTrace: true, grep:argv.test}));
});
 
//test scripts
gulp.task('test', [], function(){
  return gulp.src('test/**/*.test.js', {read: false})
  	.pipe(mocha({
      reporter:'spec',
      fullTrace: true,
      compilers: 'js:babel-core/register'
    }))
  	.on("error", function(err) {
  		console.log(err.toString());
  		this.emit('end');
  		 process.exit();
  	})
    .once('end', () => {
        process.exit();
    });
});