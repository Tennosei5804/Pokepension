package net.minecraftforge.event;

import net.minecraftforge.eventbus.api.Event;

/** Stub de compilation — Forge 36.2.42, event/TickEvent.java. */
public class TickEvent extends Event {
    public enum Phase {
        START, END;
    }

    public final Phase phase = null;

    public static class ClientTickEvent extends TickEvent {
    }
}
