<script lang="ts">
  // Decorative only, no props.
</script>

<!-- Decorative rays from the point of impact; they sit behind the burst. Motion: animations.css (REVEAL). -->
<div class="speed-lines" aria-hidden="true"></div>

<style>
  .speed-lines {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 1;
    width: 760px;
    height: 760px;
    translate: -50% -50%;
    background: repeating-conic-gradient(
      from 0deg,
      color-mix(in srgb, var(--line) 85%, transparent) 0 2.5deg,
      transparent 2.5deg 13deg
    );
    /* #000 is the mask's opaque stop (allowed by the spec); the middle stays free for the burst. */
    mask: radial-gradient(circle, transparent 0 20%, #000 34%);
    /* Static look under reduced motion; the REVEAL keyframes take over otherwise. */
    opacity: 0.45;
    pointer-events: none;
  }
</style>
