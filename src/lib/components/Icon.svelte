<script>
	let { name, size = 20, stroke = 1.7 } = $props();
	const paths = {
		target:
			'M12 3v4m0 10v4M3 12h4m10 0h4M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M5.6 5.6a9 9 0 0 1 12.8 0m0 12.8a9 9 0 0 1-12.8 0',
		camera:
			'M15 9l5-3v12l-5-3M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
		check: 'm5 12 4 4L19 6',
		chevron: 'm9 5 7 7-7 7',
		plus: 'M12 5v14M5 12h14',
		close: 'm6 6 12 12M6 18 18 6',
		settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
		history: 'M4 5v5h5M4 10a8 8 0 1 1 0 5m8-8v5l3 2',
		play: 'm9 5 11 7-11 7V5Z',
		pause: 'M8 5v14M16 5v14',
		stop: 'M6 6h12v12H6V6Z',
		expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
		zoom: 'M10 6v8m-4-4h8m2 6 5 5M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0',
		undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12h-3',
		refresh: 'M20 4v5h-5M4 20v-5h5m10-6a8 8 0 0 0-13-4m-1 10a8 8 0 0 0 13 4',
		light: 'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Zm4-13v2M2 9h2m16 0h2M4 3l2 2m12 0 2-2',
		sound: 'm11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
		trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
		help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0',
		arrow: 'M4 12h16m-6-6 6 6-6 6',
		grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] || paths.target} /></svg
>
