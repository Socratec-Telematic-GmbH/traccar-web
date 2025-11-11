import { interpolateTurbo, DIGITAL_INPUT_COLOR } from '../../common/util/colors';
import { speedFromKnots, speedUnitString } from '../../common/util/converter';

export class SpeedLegendControl {
  constructor(positions, speedUnit, t, maxSpeed, minSpeed, colorByDigitalInputEnabled, colorByDigitalInputName) {
    this.positions = positions;
    this.t = t;
    this.speedUnit = speedUnit;
    this.maxSpeed = maxSpeed;
    this.minSpeed = minSpeed;
    this.colorByDigitalInputEnabled = colorByDigitalInputEnabled;
    this.colorByDigitalInputName = colorByDigitalInputName;
  }

  onAdd(map) {
    this.map = map;
    this.controlContainer = document.createElement('div');
    this.controlContainer.className = 'maplibregl-ctrl maplibregl-ctrl-scale';

    if (this.positions.length && this.maxSpeed) {
      this.controlContainer.appendChild(this.createSpeedLegend());
    }

    return this.controlContainer;
  }

  onRemove() {
    if (this.controlContainer && this.controlContainer.parentNode) {
      this.controlContainer.parentNode.removeChild(this.controlContainer);
      this.map = undefined;
    }
  }

  createSpeedLegend() {
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.gap = '5px';

    // Speed gradient legend
    const speedLegend = document.createElement('div');
    const gradientStops = Array.from({ length: 10 }, (_, i) => {
      const t = i / 9;
      const [r, g, b] = interpolateTurbo(t);
      return `rgb(${r}, ${g}, ${b})`;
    }).join(', ');

    const colorBar = document.createElement('div');
    colorBar.style.background = `linear-gradient(to right, ${gradientStops})`;
    colorBar.style.height = '10px';

    const speedLabel = document.createElement('span');
    const minSpeed = Math.round(speedFromKnots(this.minSpeed, this.speedUnit));
    const maxSpeed = Math.round(speedFromKnots(this.maxSpeed, this.speedUnit));
    speedLabel.textContent = `${minSpeed} - ${maxSpeed} ${speedUnitString(this.speedUnit, this.t)}`;

    speedLegend.appendChild(colorBar);
    speedLegend.appendChild(speedLabel);
    legend.appendChild(speedLegend);

    // Digital input legend (if enabled)
    if (this.colorByDigitalInputEnabled && this.colorByDigitalInputName) {
      const digitalInputLegend = document.createElement('div');
      digitalInputLegend.style.display = 'flex';
      digitalInputLegend.style.alignItems = 'center';
      digitalInputLegend.style.gap = '5px';
      digitalInputLegend.style.marginTop = '3px';

      const colorBox = document.createElement('div');
      colorBox.style.width = '15px';
      colorBox.style.height = '15px';
      colorBox.style.backgroundColor = DIGITAL_INPUT_COLOR;
      colorBox.style.border = '1px solid rgba(0,0,0,0.2)';

      const label = document.createElement('span');
      const inputNumber = this.colorByDigitalInputName.replace('in', '');
      label.textContent = `${this.t('positionInput')} ${inputNumber} ${this.t('legendDigitalInputActive')}`;
      label.style.fontSize = '0.9em';

      digitalInputLegend.appendChild(colorBox);
      digitalInputLegend.appendChild(label);
      legend.appendChild(digitalInputLegend);
    }

    return legend;
  }
}

export default SpeedLegendControl;
