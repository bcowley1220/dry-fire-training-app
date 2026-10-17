<script>
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	export let zones;
	export let mobile = false;
	export let canCalibrate = false;

	const dispatch = createEventDispatcher();

	function updateZoneBounds(zoneName, axis, index, value) {
		const numValue = parseFloat(value);
		if (isNaN(numValue) || numValue < 0 || numValue > 1) return;

		zones[zoneName].bounds[axis][index] = numValue;
		// Ensure min < max
		if (index === 0 && zones[zoneName].bounds[axis][0] >= zones[zoneName].bounds[axis][1]) {
			zones[zoneName].bounds[axis][0] = zones[zoneName].bounds[axis][1] - 0.01;
		}
		if (index === 1 && zones[zoneName].bounds[axis][1] <= zones[zoneName].bounds[axis][0]) {
			zones[zoneName].bounds[axis][1] = zones[zoneName].bounds[axis][0] + 0.01;
		}
		zones = { ...zones }; // Trigger reactivity
	}

	function updateZonePoints(zoneName, value) {
		const numValue = parseInt(value);
		if (isNaN(numValue) || numValue < 0) return;
		zones[zoneName].points = numValue;
		zones = { ...zones }; // Trigger reactivity
	}
</script>

<div class="zone-editor" class:compact={mobile}>
	<p class="small muted">
		Draw A, C, and D zones on the most recently added target, from the smallest zone to the largest.
	</p>
	<button class="btn btn-full" disabled={!canCalibrate} on:click={() => dispatch('defineZones')}
		><Icon name="target" size={18} />Draw zones on target</button
	>
	<div class="zone-points">
		{#each ['A', 'C', 'D'] as name (name)}<div class="field">
				<label for="zone-points-{name}-{mobile}">{name} zone points</label><input
					id="zone-points-{name}-{mobile}"
					type="number"
					min="0"
					max="10"
					value={zones[name].points}
					on:change={(event) => updateZonePoints(name, event.target.value)}
				/>
			</div>{/each}
	</div>
	<details class="tool-disclosure">
		<summary>Adjust zone boundaries</summary>
		<p class="small muted boundary-note">
			Values are relative to the target, from 0 to 1. These scoring settings apply to all custom
			targets.
		</p>
		{#each ['A', 'C', 'D'] as name (name)}<div class="zone-boundaries">
				<strong>{name} zone</strong>{#each ['x', 'y'] as axis (axis)}<div class="field-pair">
						{#each ['Start', 'End'] as label, index (label)}<div class="field">
								<label for="zone-{name}-{axis}-{index}-{mobile}"
									>{axis === 'x' ? 'Horizontal' : 'Vertical'}
									{label.toLowerCase()}
									<span class="muted">{zones[name].bounds[axis][index].toFixed(2)}</span></label
								><input
									id="zone-{name}-{axis}-{index}-{mobile}"
									type="range"
									min="0"
									max="1"
									step=".01"
									value={zones[name].bounds[axis][index]}
									on:input={(event) => updateZoneBounds(name, axis, index, event.target.value)}
								/>
							</div>{/each}
					</div>{/each}
			</div>{/each}
	</details>
	<button class="btn btn-quiet btn-full" on:click={() => dispatch('reset')}
		>Reset scoring zones</button
	>
</div>

<style>
	.zone-editor {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.zone-points {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.zone-points label {
		font-size: 0.75rem;
	}
	.zone-boundaries {
		border-top: 1px solid #d9e1eb;
		padding-top: 18px;
		margin-top: 18px;
	}
	.zone-boundaries > strong {
		display: block;
		margin-bottom: 16px;
	}
	.zone-boundaries label {
		font-size: 0.75rem;
	}
	.boundary-note {
		margin-bottom: 18px;
	}
	.compact {
		gap: 14px;
	}
</style>
