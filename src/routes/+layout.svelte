<script>
	import '@fontsource/atkinson-hyperlegible-next/400.css';
	import '@fontsource/atkinson-hyperlegible-next/600.css';
	import '@fontsource/barlow-semi-condensed/500.css';
	import '@fontsource/barlow-semi-condensed/600.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
