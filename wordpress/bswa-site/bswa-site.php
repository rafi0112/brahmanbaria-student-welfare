<?php
/**
 * Plugin Name:       BSWA Website
 * Description:       Shows the BSWA website (ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয়) on this WordPress site. The pages, texts and pictures come from the BSWA server and Supabase, as on the main site; everything is managed in the site's own admin panel at /admin.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            BSWA
 * License:           Proprietary
 * Text Domain:       bswa-site
 */

if (!defined('ABSPATH')) {
	exit;
}

define('BSWA_SITE_DIR', __DIR__ . '/app');

/*
 * Every visitor address of this WordPress site is answered by the BSWA website: a file of the site (a script, a
 * picture) when one has that name, otherwise the site's page, which then shows the right screen itself.
 * WordPress keeps its own addresses: the dashboard (/wp-admin), sign-in (/wp-login.php), its files (/wp-content,
 * /wp-includes), the REST API (/wp-json) and the rest of /wp-*.
 */
add_action('init', 'bswa_site_serve', 0);

function bswa_site_serve() {
	if (is_admin() || wp_doing_ajax() || wp_doing_cron() || (defined('WP_CLI') && WP_CLI) || (defined('REST_REQUEST') && REST_REQUEST)) {
		return;
	}
	$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
	if ($method !== 'GET' && $method !== 'HEAD') {
		return;
	}
	$uri  = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
	$path = rawurldecode((string) parse_url($uri, PHP_URL_PATH));

	// WordPress in a folder (example.org/site/): the BSWA site is built for the top of a domain, so leave it alone.
	$home = rtrim((string) parse_url(home_url('/'), PHP_URL_PATH), '/');
	if ($home !== '') {
		return;
	}
	if (preg_match('#^/(wp-|xmlrpc\.php|index\.php/wp-json|\?rest_route=)#', $path) || isset($_GET['rest_route'])) {
		return;
	}

	$file = bswa_site_file($path);
	if ($file !== '') {
		bswa_site_send_file($file, $path);
	}
	bswa_site_send_page();
}

/** The file of the site at this address, or '' (never anything outside the plugin's app folder). */
function bswa_site_file($path) {
	if ($path === '' || $path === '/' || substr($path, -1) === '/' || strpos($path, "\0") !== false) {
		return '';
	}
	$root = realpath(BSWA_SITE_DIR);
	$full = realpath(BSWA_SITE_DIR . '/' . ltrim($path, '/'));
	if ($root === false || $full === false || !is_file($full)) {
		return '';
	}
	if (strpos($full, $root . DIRECTORY_SEPARATOR) !== 0 || basename($full) === 'index.html') {
		return '';
	}
	return $full;
}

function bswa_site_types() {
	return array(
		'js' => 'text/javascript; charset=utf-8', 'mjs' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8',
		'html' => 'text/html; charset=utf-8', 'json' => 'application/json; charset=utf-8', 'webmanifest' => 'application/manifest+json; charset=utf-8',
		'xml' => 'application/xml; charset=utf-8', 'txt' => 'text/plain; charset=utf-8', 'svg' => 'image/svg+xml',
		'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'avif' => 'image/avif', 'gif' => 'image/gif', 'ico' => 'image/x-icon',
		'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'mp4' => 'video/mp4', 'webm' => 'video/webm',
	);
}

function bswa_site_headers() {
	header('X-Content-Type-Options: nosniff');
	header('Referrer-Policy: strict-origin-when-cross-origin');
	header('X-Frame-Options: SAMEORIGIN');
}

function bswa_site_send_file($file, $path) {
	$ext   = strtolower(pathinfo($file, PATHINFO_EXTENSION));
	$types = bswa_site_types();
	if (!isset($types[$ext])) {
		return; // an unknown kind of file is not served; the page answers instead
	}
	$size  = filesize($file);
	$mtime = filemtime($file);
	$etag  = '"' . dechex($mtime) . '-' . dechex($size) . '"';
	status_header(200);
	bswa_site_headers();
	header('Content-Type: ' . $types[$ext]);
	header('ETag: ' . $etag);
	// files under /assets/ carry their content in their name, so they never change
	header(strpos($path, '/assets/') === 0 ? 'Cache-Control: public, max-age=31536000, immutable' : 'Cache-Control: public, max-age=3600');
	if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
		status_header(304);
		exit;
	}
	// scripts and styles also ship ready-compressed (file.js.gz); a browser that accepts gzip gets that much smaller copy
	header('Vary: Accept-Encoding');
	$accepts = isset($_SERVER['HTTP_ACCEPT_ENCODING']) && stripos($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip') !== false;
	if ($accepts && is_file($file . '.gz') && !ini_get('zlib.output_compression')) {
		$file = $file . '.gz';
		$size = filesize($file);
		header('Content-Encoding: gzip');
	}
	header('Content-Length: ' . $size);
	while (ob_get_level() > 0) {
		ob_end_clean(); // nothing WordPress buffered may go before the file
	}
	if (strtoupper($_SERVER['REQUEST_METHOD']) !== 'HEAD') {
		readfile($file);
	}
	exit;
}

function bswa_site_send_page() {
	$index = BSWA_SITE_DIR . '/index.html';
	if (!is_file($index)) {
		return; // the app folder is missing: let WordPress answer as usual
	}
	status_header(200);
	bswa_site_headers();
	header('Content-Type: text/html; charset=utf-8');
	header('Cache-Control: no-cache');
	if (strtoupper($_SERVER['REQUEST_METHOD']) !== 'HEAD') {
		readfile($index);
	}
	exit;
}

/* A short note on the WordPress Plugins page and dashboard, so whoever runs this WordPress knows where things are. */
add_filter('plugin_row_meta', function ($links, $file) {
	if ($file === plugin_basename(__FILE__)) {
		$links[] = '<a href="' . esc_url(home_url('/')) . '" target="_blank" rel="noopener">' . esc_html__('Open the BSWA site', 'bswa-site') . '</a>';
		$links[] = '<a href="' . esc_url(home_url('/admin')) . '" target="_blank" rel="noopener">' . esc_html__('BSWA admin panel', 'bswa-site') . '</a>';
	}
	return $links;
}, 10, 2);

add_action('admin_notices', function () {
	$screen = function_exists('get_current_screen') ? get_current_screen() : null;
	if (!$screen || !in_array($screen->id, array('dashboard', 'plugins'), true)) {
		return;
	}
	$home = rtrim((string) parse_url(home_url('/'), PHP_URL_PATH), '/');
	if ($home !== '') {
		echo '<div class="notice notice-error"><p><strong>BSWA Website:</strong> ' . esc_html__('This WordPress is installed in a folder. The BSWA site works only when WordPress is at the top of the domain (for example https://bswa.org/, not https://bswa.org/site/).', 'bswa-site') . '</p></div>';
		return;
	}
	echo '<div class="notice notice-info"><p><strong>BSWA Website</strong> — '
		. esc_html__('The public site of this domain is the BSWA website. Its posts, events, members and pictures are managed in its own admin panel, not in WordPress:', 'bswa-site')
		. ' <a href="' . esc_url(home_url('/admin')) . '" target="_blank" rel="noopener">' . esc_html(home_url('/admin')) . '</a></p></div>';
});
