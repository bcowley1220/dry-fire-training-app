<script>
	import { createEventDispatcher } from 'svelte';
	import { templates } from '../utils/zones.js';
	import Icon from './Icon.svelte';
	export let targetMode = 'custom';
	export let selectedTemplate = 'ipsc-classic';
	const dispatch = createEventDispatcher();
	const modes = [
		{
			id: 'custom',
			name: 'Use anything as a target',
			description: 'Mark an area on paper, a wall, or an object.',
			icon: 'target'
		},
		{
			id: 'preloaded',
			name: 'Use a target template',
			description: 'Match scoring zones to a printed target.',
			icon: 'grid'
		},
		{
			id: 'freeform',
			name: 'Practice without boundaries',
			description: 'Register laser hits anywhere in the view.',
			icon: 'expand'
		}
	];
</script>

<fieldset class="target-modes">
	<legend class="sr-only">How would you like to define targets?</legend>
	{#each modes as mode (mode.id)}
		<label class="mode-option" class:selected={targetMode === mode.id}>
			<input
				type="radio"
				name="target-mode"
				value={mode.id}
				bind:group={targetMode}
				onchange={() => dispatch('change')}
			/>
			<Icon name={mode.icon} size={21} />
			<span><strong>{mode.name}</strong><small>{mode.description}</small></span>
			<span class="radio-dot"></span>
		</label>
	{/each}
</fieldset>
{#if targetMode === 'preloaded'}
	<div class="field template-select">
		<label for="target-template">Printed target</label>
		<select id="target-template" bind:value={selectedTemplate} onchange={() => dispatch('change')}>
			{#each Object.entries(templates).filter(([, template]) => !template.grid) as [id, template] (id)}
				<option value={id}>{template.name}</option>
			{/each}
		</select>
		<p class="small muted">Keep the whole target in view. You'll mark its four corners.</p>
	</div>
{/if}

<style>
	.target-modes {
		border: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
		margin: 0;
	}
	.mode-option {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 76px;
		padding: 14px;
		border: 1px solid #d9e1eb;
		border-radius: 9px;
		cursor: pointer;
		position: relative;
		background: white;
	}
	.mode-option input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.mode-option:has(input:focus-visible) {
		outline: 3px solid #315de3;
		outline-offset: 3px;
	}
	.mode-option.selected {
		border-color: #315de3;
		background: #f0f4ff;
	}
	.mode-option > :global(svg) {
		color: #315de3;
	}
	.mode-option strong {
		display: block;
		font-size: 0.93rem;
		font-weight: 600;
	}
	.mode-option small {
		display: block;
		color: #5b6d80;
		font-size: 0.82rem;
		line-height: 1.4;
		margin-top: 3px;
	}
	.radio-dot {
		margin-left: auto;
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		border: 1.5px solid #b4c1d1;
		border-radius: 50%;
	}
	.selected .radio-dot {
		border: 5px solid #315de3;
	}
	.template-select {
		margin-top: 18px;
	}
</style>
