import { nanoid } from 'nanoid';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';
import { Socket } from 'socket.io';
import TwilioVideo from './TwilioVideo';
import Player from '../types/Player';
import CoveyTownController from './CoveyTownController';
import CoveyTownListener from '../types/CoveyTownListener';
import { UserLocation } from '../CoveyTypes';
import PlayerSession from '../types/PlayerSession';
import { townSubscriptionHandler } from '../requestHandlers/CoveyTownRequestHandlers';
import CoveyTownsStore from './CoveyTownsStore';
import * as TestUtils from '../client/TestUtils';
import { ServerConversationArea } from '../client/TownsServiceClient';

const mockTwilioVideo = mockDeep<TwilioVideo>();
jest.spyOn(TwilioVideo, 'getInstance').mockReturnValue(mockTwilioVideo);

function generateTestLocation(): UserLocation {
  return {
    rotation: 'back',
    moving: Math.random() < 0.5,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
  };
}

describe('CoveyTownController', () => {
  beforeEach(() => {
    mockTwilioVideo.getTokenForTown.mockClear();
  });
  it('constructor should set the friendlyName property', () => { 
    const townName = `FriendlyNameTest-${nanoid()}`;
    const townController = new CoveyTownController(townName, false);
    expect(townController.friendlyName)
      .toBe(townName);
  });
  describe('addPlayer', () => { 
    it('should use the coveyTownID and player ID properties when requesting a video token',
      async () => {
        const townName = `FriendlyNameTest-${nanoid()}`;
        const townController = new CoveyTownController(townName, false);
        const newPlayerSession = await townController.addPlayer(new Player(nanoid()));
        expect(mockTwilioVideo.getTokenForTown).toBeCalledTimes(1);
        expect(mockTwilioVideo.getTokenForTown).toBeCalledWith(townController.coveyTownID, newPlayerSession.player.id);
      });
  });
  describe('town listeners and events', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>()];
    beforeEach(() => {
      const townName = `town listeners and events tests ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockListeners.forEach(mockReset);
    });
    it('should notify added listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);
      const newLocation = generateTestLocation();
      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(listener => expect(listener.onPlayerMoved).toBeCalledWith(player));
    });
    it('should notify added listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.destroySession(session);
      mockListeners.forEach(listener => expect(listener.onPlayerDisconnected).toBeCalledWith(player));
    });
    it('should notify added listeners of new players when addPlayer is called', async () => {
      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const player = new Player('test player');
      await testingTown.addPlayer(player);
      mockListeners.forEach(listener => expect(listener.onPlayerJoined).toBeCalledWith(player));

    });
    it('should notify added listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.disconnectAllPlayers();
      mockListeners.forEach(listener => expect(listener.onTownDestroyed).toBeCalled());

    });
    it('should not notify removed listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const newLocation = generateTestLocation();
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(listenerRemoved.onPlayerMoved).not.toBeCalled();
    });
    it('should not notify removed listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerDisconnected).not.toBeCalled();

    });
    it('should not notify removed listeners of new players when addPlayer is called', async () => {
      const player = new Player('test player');

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      const session = await testingTown.addPlayer(player);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerJoined).not.toBeCalled();
    });

    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();

    });
    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();

    });
    // HW 3.1.2

  });
  describe('townSubscriptionHandler', () => {
    const mockSocket = mock<Socket>();
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `connectPlayerSocket tests ${nanoid()}`;
      testingTown = CoveyTownsStore.getInstance().createTown(townName, false);
      mockReset(mockSocket);
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
    });
    it('should reject connections with invalid town IDs by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    it('should reject connections with invalid session tokens by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, nanoid(), mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    describe('with a valid session token', () => {
      it('should add a town listener, which should emit "newPlayer" to the socket when a player joins', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        townSubscriptionHandler(mockSocket);
        await testingTown.addPlayer(player);
        expect(mockSocket.emit).toBeCalledWith('newPlayer', player);
      });
      it('should add a town listener, which should emit "playerMoved" to the socket when a player moves', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        townSubscriptionHandler(mockSocket);
        testingTown.updatePlayerLocation(player, generateTestLocation());
        expect(mockSocket.emit).toBeCalledWith('playerMoved', player);

      });
      it('should add a town listener, which should emit "playerDisconnect" to the socket when a player disconnects', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        townSubscriptionHandler(mockSocket);
        testingTown.destroySession(session);
        expect(mockSocket.emit).toBeCalledWith('playerDisconnect', player);
      });
      it('should add a town listener, which should emit "townClosing" to the socket and disconnect it when disconnectAllPlayers is called', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        townSubscriptionHandler(mockSocket);
        testingTown.disconnectAllPlayers();
        expect(mockSocket.emit).toBeCalledWith('townClosing');
        expect(mockSocket.disconnect).toBeCalledWith(true);
      });
      describe('when a socket disconnect event is fired', () => {
        it('should remove the town listener for that socket, and stop sending events to it', async () => {
          TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            const newPlayer = new Player('should not be notified');
            await testingTown.addPlayer(newPlayer);
            expect(mockSocket.emit).not.toHaveBeenCalledWith('newPlayer', newPlayer);
          } else {
            fail('No disconnect handler registered');
          }
        });
        it('should destroy the session corresponding to that socket', async () => {
          TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            mockReset(mockSocket);
            TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
            townSubscriptionHandler(mockSocket);
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
          } else {
            fail('No disconnect handler registered');
          }

        });
      });
      it('should forward playerMovement events from the socket to subscribed listeners', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerMovement' event handler for the socket, which should have been registered after the socket was connected
        const playerMovementHandler = mockSocket.on.mock.calls.find(call => call[0] === 'playerMovement');
        if (playerMovementHandler && playerMovementHandler[1]) {
          const newLocation = generateTestLocation();
          player.location = newLocation;
          playerMovementHandler[1](newLocation);
          expect(mockListener.onPlayerMoved).toHaveBeenCalledWith(player);
        } else {
          fail('No playerMovement handler registered');
        }
      });
    });
  });
  describe('addConversationArea', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('should add the conversation area to the list of conversation areas', ()=>{
      const newConversationArea = TestUtils.createConversationForTesting();
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
    });
  });

  // HW 3.1
  // 3.1.1 : ensure players are removed from conversation areas
  // 3.1.2 : ensure onconversation areas listeners are updated.

  describe('conversationArea behavior', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>()];
    const newConversationArea = TestUtils.createConversationForTesting({ 
      boundingBox: { x: 10, y: 10, height: 10, width: 10 } });
    const newLocation1:UserLocation = { moving: false, rotation: 'front', x: 10, y: 10, 
      conversationLabel: newConversationArea.label };    
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      mockListeners.forEach(mockReset);
      player1 = new Player(nanoid());
      player2 = new Player(nanoid());

    });
    it('should remove the player from the conversation area on disconnection', async ()=>{

      await testingTown.addPlayer(player1);
      const session2 = await testingTown.addPlayer(player2);
      // async adding problem error display

      testingTown.updatePlayerLocation(player1, newLocation1);
      testingTown.updatePlayerLocation(player2, newLocation1);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(2);

      testingTown.destroySession(session2);
      expect(areas[0].occupantsByID.length).toBe(1);
    });
    it('should emit an onConversationUpdated event when a player leaves the conversation area', async ()=>{
      
      await testingTown.addPlayer(player1);
      const session = await testingTown.addPlayer(player2);

      testingTown.updatePlayerLocation(player1, newLocation1);
      testingTown.updatePlayerLocation(player2, newLocation1);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const area = testingTown.conversationAreas[0];
      testingTown.destroySession(session);
      mockListeners.forEach(listener => expect(listener.onConversationAreaUpdated).toBeCalledWith(area));
    });
    it('should NOT emit an onConversationUpdated event when the last player leaves the conversation area', async ()=>{
      
      const session = await testingTown.addPlayer(player1);
      testingTown.updatePlayerLocation(player1, newLocation1);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const area = testingTown.conversationAreas[0];
      expect(area.occupantsByID.length).toBe(1);

      testingTown.destroySession(session);
      // not expect - WORK ON IT
      mockListeners.forEach(listener => expect(listener.onConversationAreaUpdated).not.toBeCalled());
    });
    it('should emit an onConversationAreaDestroyed event when the last player leaves the conversation area', async ()=>{
      
      const session = await testingTown.addPlayer(player1);
      testingTown.updatePlayerLocation(player1, newLocation1);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const area = testingTown.conversationAreas[0];
      expect(area.occupantsByID.length).toBe(1);

      testingTown.destroySession(session);
      mockListeners.forEach(listener => expect(listener.onConversationAreaDestroyed).toBeCalledWith(area));
      expect(testingTown.conversationAreas.length).toBe(0);
    });
  });

  // HW 3.2
  // 3.2.1 
  describe('updatePlayerLocation', () =>{
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `updatePlayerLocation test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('should respect the conversation area reported by the player userLocation.conversationLabel, and not override it based on the player\'s x,y location', async ()=>{
      const newConversationArea = TestUtils.createConversationForTesting({ boundingBox: { x: 10, y: 10, height: 5, width: 5 } });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const player = new Player(nanoid());
      await testingTown.addPlayer(player);

      const newLocation:UserLocation = { moving: false, rotation: 'front', x: 25, y: 25, conversationLabel: newConversationArea.label };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(1);
      expect(areas[0].occupantsByID[0]).toBe(player.id);

    }); 
    it('should emit an onConversationUpdated event when a conversation area gets a new occupant', async () =>{

      const newConversationArea = TestUtils.createConversationForTesting({ boundingBox: { x: 10, y: 10, height: 5, width: 5 } });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      testingTown.addTownListener(mockListener);

      const player = new Player(nanoid());
      await testingTown.addPlayer(player);
      const newLocation:UserLocation = { moving: false, rotation: 'front', x: 25, y: 25, conversationLabel: newConversationArea.label };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
    });
    // Occupants by ID
    // Emission of ConvoAreaUpdated/Destroyed
    // set active coversation area
    // existence of convo areas
    // Same area  - false
  });
  // inputs to parameters
  describe('updatePlayerLocation behavior', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>()];
    let player1:Player;
    let player2:Player;


    const newConversationArea1 = TestUtils.createConversationForTesting({ 
      boundingBox: { x: 10, y: 10, height: 10, width: 10 } } );
    const newConversationArea2 = TestUtils.createConversationForTesting({ 
      boundingBox: { x: 100, y: 100, height: 10, width: 10 } });
    let areas: ServerConversationArea[];

    const newLocation1:UserLocation = { moving: false, rotation: 'front', x: 0, y: 0, 
      conversationLabel: newConversationArea1.label }; 
    const newLocation2:UserLocation = { moving: false, rotation: 'front', x: 100, y: 100, 
      conversationLabel: newConversationArea2.label };
    const newLocationUndefined:UserLocation = { moving: false, rotation: 'front', x: 50, y: 50, 
      conversationLabel: undefined };  

    beforeEach(async () => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      const result1 = testingTown.addConversationArea(newConversationArea1);
      const result2 = testingTown.addConversationArea(newConversationArea2);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      mockListeners.forEach(mockReset);
      player1 = new Player(nanoid());
      player2 = new Player(nanoid());
      await testingTown.addPlayer(player1);
      await testingTown.addPlayer(player2);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      areas = testingTown.conversationAreas;
    });

    describe('moving from a conversationArea', () => {
      beforeEach( () => {
        testingTown.updatePlayerLocation(player1, newLocation1);
        testingTown.updatePlayerLocation(player2, newLocation1);
        mockListeners.forEach(mockReset);
        expect(areas[0].occupantsByID.length).toBe(2);
      });
      describe('into empty space', () => {
        beforeEach( () => {
          expect(player1.activeConversationArea).toBe(areas[0]);
          testingTown.updatePlayerLocation(player1, newLocationUndefined);
        });
        it('should emit onConversationAreaUpdated/Destroyed', async () => {
          await mockListeners.forEach(
            listener => expect(listener.onConversationAreaUpdated).toBeCalledWith(areas[0]));
          
          mockListeners.forEach(mockReset);
          testingTown.updatePlayerLocation(player2, newLocationUndefined);
          await mockListeners.forEach(
            listener => expect(listener.onConversationAreaUpdated).not.toBeCalled());
          await mockListeners.forEach(
            listener => expect(listener.onConversationAreaDestroyed).toBeCalled());
        });
        it('should remove the player from OccupantsID', () => {
          expect(areas[0].occupantsByID.length).toBe(1);
          expect(areas[0].occupantsByID.find((id) => id === player1.id)).toBeUndefined();
        });
        it('should set the activeConversation to undefined', () => {
          expect(player1.activeConversationArea).toBeUndefined();
        });
      }); 
      describe('into a conversationArea', () => {
        beforeEach( () => {
          expect(player1.activeConversationArea).toBe(areas[0]);
          testingTown.updatePlayerLocation(player1, newLocation2);
        });
        it('should emit onConversationAreaUpdated', async () => {
          await mockListeners.forEach(
            listener => expect(listener.onConversationAreaUpdated).toBeCalledWith(areas[1]));
        });
        it('should add the player to OccupantsID', () => {
          expect(areas[1].occupantsByID.length).toBe(1);
          expect(areas[1].occupantsByID.find((id) => id === player1.id)).toBe(player1.id);
        });
        it('should set the activeConversation to the new one', () => {
          expect(player1.activeConversationArea).toBe(areas[1]);
        });
      });
    });

    afterEach(() => {
      mockListeners.forEach(
        listener => expect(listener.onPlayerMoved).toBeCalled());
    });

    describe('moving within empty space', () => {
      it('should not emit to a conversation area', () => {
        testingTown.updatePlayerLocation(player1, newLocationUndefined);
        mockListeners.forEach(mockReset);
        testingTown.updatePlayerLocation(player1, newLocationUndefined);
        expect(mockListeners.forEach(lis => expect(lis.onConversationAreaUpdated).not.toBeCalled()));
      });
    });
  });
});
