# Timer Panel

The Timer panel is a dedicated space for the automated location-checking timer. It acts as a host container — the timer UI itself is created by the Timer service module and attached here.

If this panel is visible, it claims the timer display. If it's hidden or closed, the timer UI moves to another available host (such as the Client panel). This "rehoming" happens automatically.

The timer's controls (start, stop, interval settings) appear inside this panel once the Timer service attaches its UI.
