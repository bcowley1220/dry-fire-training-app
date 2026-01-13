# Working
[ ] split apart the main file into components
[x] Extract ActionBar component
[x] Extract CameraStage component
[x] Extract Header component
[x] Extract HitsList component
[x] Extract StatusPills component


## Features
[ ] fix the custom target selection functionality 
[ ] implement the mag change drill, we'll probably need to create a new component that is similar but different than the draw functionality. there is a data difference between what we had set up in another branch and it caused a lot of problems. We can probably reformat the data type to match regardless of the drill, but the issue is what's going to happen when we have a dozen drills all with diff data types.
[ ] if we doing "enable automatic next round", at the end of the training the "next round" button will still show. I believe it's a conditional issue with the button.
[ ] change the name of the timer button to Drills
[ ] we need to clean up the way the user interacts with the draw drill. It's easy enough to start, but doing another round of 10 or trying to get out of it isn't as obvious.

### Bugs