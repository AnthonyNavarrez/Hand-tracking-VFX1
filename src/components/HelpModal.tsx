import { useEffect, useState } from 'react';
import './HelpModal.css';

type Tab = 'hand-vfx' | 'tool-2';

type HelpModalProps = {
  onClose: () => void;
};

export function HelpModal({ onClose }: HelpModalProps) {
  const [tab, setTab] = useState<Tab>('hand-vfx');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2 className="help-title">Gesture Guide</h2>
          <button className="help-close" type="button" aria-label="Close help" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="help-tabs">
          <button
            className={`help-tab ${tab === 'hand-vfx' ? 'active' : ''}`}
            type="button"
            onClick={() => setTab('hand-vfx')}
          >
            Hand VFX Lens
          </button>
          <button
            className={`help-tab ${tab === 'tool-2' ? 'active' : ''}`}
            type="button"
            onClick={() => setTab('tool-2')}
          >
            Tool 2
          </button>
        </div>

        <div className="help-body">
          {tab === 'hand-vfx' ? <HandVfxHelp /> : <ToolTwoHelp />}
        </div>
      </div>
    </div>
  );
}

function HandVfxHelp() {
  return (
    <>
      <p className="help-section-title">Lens modes</p>
      <ul className="help-list">
        <li>
          <strong>Show both hands</strong> to open the flat lens — the four corners follow your thumbs and
          index fingertips.
        </li>
        <li>
          <strong>Right pinky up</strong> morphs the flat lens into a rotating 3D sphere.
        </li>
        <li>
          <strong>Right hand fully open</strong> expands the sphere to fill the screen.
        </li>
        <li>
          <strong>Left pinky up</strong> (sphere active) steers the sphere's rotation with your hand angle
          instead of auto-spinning.
        </li>
        <li>
          <strong>Left hand fully open</strong> crossfades into a particle field.
        </li>
      </ul>

      <p className="help-section-title">Flat lens effects</p>
      <ul className="help-list">
        <li>
          <strong>Right thumb + index tap</strong> toggles pixelation.
        </li>
        <li>
          <strong>Left thumb + index tap</strong> toggles an ordered-dither look.
        </li>
        <li>
          <strong>Left thumb held above left index</strong> adds chromatic aberration.
        </li>
        <li>
          <strong>Cross your hands</strong> (right hand past the left) adds posterization.
        </li>
        <li>
          <strong>Both index fingertips touching</strong> toggles a saturation boost.
        </li>
      </ul>

      <p className="help-section-title">Particle field</p>
      <ul className="help-list">
        <li>
          <strong>Right hand open</strong> pulls particles toward your right index fingertip.
        </li>
        <li>
          <strong>Right index up</strong> explodes the squares into smaller pieces.
        </li>
        <li>
          <strong>Right middle finger up</strong> sinks the squares downward.
        </li>
        <li>
          <strong>Move your left hand</strong> to swarm the squares and repel the circles.
        </li>
      </ul>
    </>
  );
}

function ToolTwoHelp() {
  return <p className="help-placeholder">Tool 2 doesn't exist yet — its gestures will be documented here once it's built.</p>;
}
