import { ArrowLeftOutlined, CheckCircleFilled, CloseOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';

import { AppDrawer } from '@/modules/common';
import { CARD_IDS } from '@/shared/catalog/card-catalog';
import {
    buildTeamIds,
    createBalancedTeamAssignment,
    createRandomTeamAssignment,
    createTeamAssignmentFromDraft,
    deriveBalancedTeamSizes,
    isRosterValid,
    validateTeamAssignment,
    type TeamAssignmentDraft,
    type TeamAssignmentInvalidReason,
} from '@/shared/domain/setup';
import { useSetupStore } from '@/shared/store/setup.store';
import type { Player, TeamAssignment, TeamId } from '@/shared/types/setup';

import styles from './teams.module.css';

const TEAM_HEADER_CLASSES = [styles.teamPrimary, styles.teamTertiary, styles.teamSecondary];

function DiceIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <circle cx="16" cy="8" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="8" cy="16" r="1.5" fill="currentColor" />
            <circle cx="16" cy="16" r="1.5" fill="currentColor" />
        </svg>
    );
}

function createAssignmentDraft(assignment: TeamAssignment): TeamAssignmentDraft {
    return Object.fromEntries(
        assignment.teams.flatMap((team) => team.playerIds.map((playerId) => [playerId, team.teamId])),
    );
}

function createInitialDraft(players: Player[], teamCount: number, assignment: TeamAssignment): TeamAssignmentDraft {
    if (validateTeamAssignment(players, teamCount, assignment).kind === 'valid') {
        return createAssignmentDraft(assignment);
    }
    const balanced = createBalancedTeamAssignment(players, teamCount);
    return balanced.kind === 'success' ? createAssignmentDraft(balanced.assignment) : {};
}

function getValidationMessage(reason: TeamAssignmentInvalidReason) {
    switch (reason) {
        case 'unassigned-player':
            return 'Todavía hay jugadores sin equipo.';
        case 'insufficient-team-size':
            return 'Cada equipo debe tener al menos 2 jugadores.';
        case 'unbalanced':
            return 'La diferencia entre el equipo más grande y el más pequeño no puede superar 1 jugador.';
        case 'duplicate-player':
            return 'Un jugador no puede aparecer en más de un equipo.';
        default:
            return 'La distribución no coincide con los jugadores y equipos actuales.';
    }
}

function getPlayerTeamLabel(teamId: TeamId | undefined, teamIds: TeamId[]) {
    if (!teamId) return 'Sin equipo';
    const index = teamIds.indexOf(teamId);
    return index >= 0 ? `Equipo ${index + 1}` : 'Sin equipo';
}

function TeamsPage() {
    const navigate = useNavigate();
    const { nickname, ownerPlayerId, players, teamCount, teamAssignment, commitTeamAssignment, startCardDraft } =
        useSetupStore(
            useShallow((state) => ({
                nickname: state.nickname,
                ownerPlayerId: state.ownerPlayerId,
                players: state.players,
                teamCount: state.teamCount,
                teamAssignment: state.teamAssignment,
                commitTeamAssignment: state.commitTeamAssignment,
                startCardDraft: state.startCardDraft,
            })),
        );
    const teamIds = buildTeamIds(teamCount);
    const targetSizes = deriveBalancedTeamSizes(players.length, teamCount);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [assignmentDraft, setAssignmentDraft] = useState<TeamAssignmentDraft>(() =>
        createInitialDraft(players, teamCount, teamAssignment),
    );
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [hasRandomized, setHasRandomized] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const hasOwner =
        Boolean(nickname.trim()) && ownerPlayerId !== null && players.some((player) => player.id === ownerPlayerId);
    const draftResult = createTeamAssignmentFromDraft(players, teamCount, assignmentDraft);
    const selectedPlayer = players.find((player) => player.id === selectedPlayerId);

    if (!hasOwner) return <Navigate to="/" replace />;
    if (!isRosterValid(players)) return <Navigate to="/players" replace />;

    const selectPlayer = (player: Player) => {
        setSelectedPlayerId(player.id);
        setDrawerOpen(false);
        setStatusMessage(`${player.name} está seleccionado.`);
    };

    const moveSelectedPlayer = (teamId: TeamId) => {
        if (!selectedPlayer) return;
        const destinationIndex = teamIds.indexOf(teamId);
        const capacity = targetSizes[destinationIndex];
        if (destinationIndex < 0 || capacity === undefined) {
            setStatusMessage('No se encontró el equipo de destino.');
            return;
        }
        const destinationOccupants = players.filter((player) => assignmentDraft[player.id] === teamId).length;
        if (destinationOccupants >= capacity) {
            setStatusMessage(`El Equipo ${destinationIndex + 1} está completo.`);
            return;
        }
        const previousTeamId = assignmentDraft[selectedPlayer.id];
        const nextDraft = { ...assignmentDraft, [selectedPlayer.id]: teamId };
        const nextAssignment = createTeamAssignmentFromDraft(players, teamCount, nextDraft);
        setAssignmentDraft(nextDraft);
        setSelectedPlayerId(null);

        if (nextAssignment.kind === 'invalid') {
            setStatusMessage(`${selectedPlayer.name} ${previousTeamId ? 'se movió' : 'se asignó'} en el borrador.`);
            return;
        }
        if (commitTeamAssignment(nextAssignment.assignment).kind === 'invalid') {
            setStatusMessage('No se pudo aplicar la distribución completa.');
            return;
        }
        setStatusMessage('La distribución completa y equilibrada se aplicó automáticamente.');
    };

    const removeFromTeam = (player: Player) => {
        const nextDraft = { ...assignmentDraft, [player.id]: undefined };
        setAssignmentDraft(nextDraft);
        setSelectedPlayerId(player.id);
        setStatusMessage(`${player.name} quedó sin equipo. Elegí un equipo de destino.`);
    };

    const handleRandomAssignment = () => {
        const result = createRandomTeamAssignment(players, teamCount, Math.random, teamAssignment);
        if (result.kind === 'invalid' || commitTeamAssignment(result.assignment).kind === 'invalid') {
            setStatusMessage('No se pudo crear una distribución válida.');
            return;
        }
        setAssignmentDraft(createAssignmentDraft(result.assignment));
        setSelectedPlayerId(null);
        setHasRandomized(true);
        setDrawerOpen(false);
        setStatusMessage('Se creó y aplicó una nueva distribución equilibrada al azar.');
    };

    const handleStartCardDraft = () => {
        if (draftResult.kind === 'invalid') {
            setStatusMessage(getValidationMessage(draftResult.reason));
            return;
        }
        if (commitTeamAssignment(draftResult.assignment).kind === 'invalid') {
            setStatusMessage('No se pudo confirmar la distribución antes de elegir cartas.');
            return;
        }
        const startResult = startCardDraft(CARD_IDS, Math.random);
        if (startResult.kind === 'rejected') {
            setStatusMessage('No se pudo preparar un reparto privado con la configuración actual.');
            return;
        }
        navigate('/cards');
    };

    const validationMessage =
        draftResult.kind === 'invalid'
            ? getValidationMessage(draftResult.reason)
            : 'La distribución está completa y equilibrada.';

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Tooltip title="Volver a jugadores">
                    <Button
                        className={styles.backButton}
                        type="primary"
                        shape="circle"
                        icon={<ArrowLeftOutlined />}
                        aria-label="Volver a jugadores"
                        onClick={() => navigate('/players')}
                    />
                </Tooltip>
                <h1>ARMAR EQUIPOS</h1>
                <span className={styles.headerSpacer} aria-hidden="true" />
            </header>

            <AppDrawer
                open={drawerOpen}
                title="Jugadores"
                description="Sorteá los equipos o seleccioná a quién querés asignar o mover."
                onClose={() => setDrawerOpen(false)}
            >
                <div className={styles.drawerContent}>
                    <Button size="large" block icon={<DiceIcon />} variant="solid" onClick={handleRandomAssignment}>
                        {hasRandomized ? 'Volver a sortear' : 'Sortear al azar'}
                    </Button>
                    <ul className={styles.playerPicker} aria-label="Jugadores disponibles">
                        {players.map((player) => {
                            const isSelected = player.id === selectedPlayerId;
                            return (
                                <li key={player.id}>
                                    <button
                                        type="button"
                                        className={styles.playerOption}
                                        aria-pressed={isSelected}
                                        onClick={() => selectPlayer(player)}
                                    >
                                        <span className={styles.playerOptionText}>
                                            <strong>{player.name}</strong>
                                            <span>{getPlayerTeamLabel(assignmentDraft[player.id], teamIds)}</span>
                                        </span>
                                        <span className={styles.selectionState}>
                                            {isSelected ? (
                                                <>
                                                    <CheckCircleFilled aria-hidden="true" /> Seleccionado
                                                </>
                                            ) : (
                                                'Seleccionar'
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </AppDrawer>

            <main className={styles.main}>
                <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
                    {selectedPlayer
                        ? `${selectedPlayer.name}: elegí un equipo de destino.`
                        : statusMessage || 'Elegí un jugador desde la lista para asignarlo o moverlo.'}{' '}
                    {validationMessage}
                </p>

                <section className={styles.teamsSection} aria-label="Distribución por equipos editable">
                    {teamIds.map((teamId, index) => {
                        const teamPlayers = players.filter((player) => assignmentDraft[player.id] === teamId);
                        const capacity = targetSizes[index];
                        const isAtCapacity = teamPlayers.length >= capacity;
                        const selectedTeamId = selectedPlayer ? assignmentDraft[selectedPlayer.id] : undefined;
                        const isSelectedDestination = selectedTeamId === teamId;
                        return (
                            <article key={teamId} className={styles.teamCard}>
                                <header className={`${styles.teamHeader} ${TEAM_HEADER_CLASSES[index % 3]}`}>
                                    <h2>Equipo {index + 1}</h2>
                                    <span>
                                        {teamPlayers.length} / {capacity} jugadores
                                    </span>
                                </header>
                                {teamPlayers.length > 0 ? (
                                    <ul className={styles.teamPlayers}>
                                        {teamPlayers.map((player) => (
                                            <li key={player.id}>
                                                <span>{player.name}</span>
                                                <Tooltip title={`Quitar a ${player.name} del Equipo ${index + 1}`}>
                                                    <Button
                                                        className={styles.removePlayerButton}
                                                        type="text"
                                                        shape="circle"
                                                        icon={<CloseOutlined />}
                                                        aria-label={`Quitar a ${player.name} del Equipo ${index + 1}`}
                                                        onClick={() => removeFromTeam(player)}
                                                    />
                                                </Tooltip>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className={styles.emptyTeam}>Este equipo todavía no tiene jugadores.</p>
                                )}
                                {selectedPlayer ? (
                                    <Button
                                        className={styles.assignButton}
                                        size="large"
                                        disabled={isSelectedDestination || isAtCapacity}
                                        onClick={() => moveSelectedPlayer(teamId)}
                                    >
                                        {isSelectedDestination
                                            ? `${selectedPlayer.name} ya está aquí`
                                            : isAtCapacity
                                              ? 'Equipo completo'
                                              : selectedTeamId
                                                ? 'Mover aquí'
                                                : 'Asignar aquí'}
                                    </Button>
                                ) : null}
                            </article>
                        );
                    })}
                </section>

                <section className={styles.actions} aria-label="Acciones de equipos">
                    <Button
                        size="large"
                        icon={<TeamOutlined />}
                        aria-haspopup="dialog"
                        aria-expanded={drawerOpen}
                        onClick={() => setDrawerOpen(true)}
                    >
                        Lista de jugadores
                    </Button>
                    <Button
                        type="primary"
                        size="large"
                        disabled={draftResult.kind === 'invalid'}
                        aria-describedby="card-selection-help"
                        onClick={handleStartCardDraft}
                    >
                        Elegir cartas
                    </Button>
                    <p
                        id="card-selection-help"
                        className={draftResult.kind === 'invalid' ? styles.requirement : styles.actionHelp}
                    >
                        {draftResult.kind === 'invalid'
                            ? validationMessage
                            : 'Cada jugador recibirá 10 cartas y las elegirá en privado.'}
                    </p>
                </section>
            </main>
        </div>
    );
}

export default TeamsPage;
