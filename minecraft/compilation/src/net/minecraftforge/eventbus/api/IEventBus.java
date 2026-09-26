package net.minecraftforge.eventbus.api;

import java.util.function.Consumer;

/** Stub de compilation — EventBus 4.0, api/IEventBus.java. */
public interface IEventBus {
    <T extends Event> void addListener(EventPriority priority, boolean receiveCancelled, Class<T> eventType, Consumer<T> consumer);
}
