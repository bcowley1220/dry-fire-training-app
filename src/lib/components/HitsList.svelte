<script>
	export let hits = [];
</script>

{#if !hits.length}<p class="small muted empty-note">
		No hits in this view yet. Detected laser pulses will appear on the camera image.
	</p>{:else}<div class="hit-list">
		<div class="hit-list-heading">
			<span>Shot</span><span>Zone</span><span>Points</span><span>Time</span>
		</div>
		{#each hits.slice(-50).reverse() as hit (hit.id)}<div>
				<strong>#{hit.shotNumber}</strong><span>{hit.zone || 'Hit'}</span><span
					>{hit.points ?? '—'}</span
				><time datetime={new Date(hit.timestamp).toISOString()}
					>{new Date(hit.timestamp).toLocaleTimeString([], {
						hour: 'numeric',
						minute: '2-digit',
						second: '2-digit'
					})}</time
				>
			</div>{/each}
	</div>{/if}

<style>
	.hit-list {
		max-height: 280px;
		overflow: auto;
		font-size: 0.8rem;
		margin-bottom: 22px;
	}
	.hit-list > div {
		display: grid;
		grid-template-columns: 45px 1fr 50px 90px;
		padding: 10px 0;
		gap: 8px;
		border-bottom: 1px solid #e4eaf2;
	}
	.hit-list-heading,
	time {
		color: #5b6d80;
	}
</style>
